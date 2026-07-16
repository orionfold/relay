import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataDir } from "@/lib/config/env";
import { db } from "@/lib/db";
import { documents, workshopRuns } from "@/lib/db/schema";
import { deleteAppCascade, getApp } from "@/lib/apps/registry";
import { addRows } from "@/lib/data/tables";
import { WORKSHOP_APP_ID } from "@/lib/workshop/builtin";
import { buildWorkshopCompletionBundle } from "@/lib/workshop/export";
import { runDeterministicWorkshopFallback } from "@/lib/workshop/fallback";
import {
  getWorkshopRun,
  startBuiltinWorkshop,
} from "@/lib/workshop/runs";

async function cleanup() {
  db.delete(documents)
    .where(eq(documents.source, "workshop-symlink-test"))
    .run();
  db.delete(workshopRuns).run();
  await deleteAppCascade(WORKSHOP_APP_ID);
}

describe("Relay Operator Workshop local journey", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("keeps the workshop run schema wired to project, workflow and receipt owners", () => {
    const config = getTableConfig(workshopRuns);
    expect(config.foreignKeys).toHaveLength(3);
    expect(
      config.foreignKeys.map((foreignKey) =>
        getTableName(foreignKey.reference().foreignTable)
      )
    ).toEqual(["projects", "workflows", "operations_receipts"]);
  });

  it("starts idempotently, observes adaptation, rehearses truthfully and exports deterministic evidence", async () => {
    const [first, concurrent] = await Promise.all([
      startBuiltinWorkshop(),
      startBuiltinWorkshop(),
    ]);
    const second = await startBuiltinWorkshop();
    expect(concurrent.id).toBe(first.id);
    expect(second.id).toBe(first.id);
    expect(first.checkpoints.find((item) => item.id === "inspect")?.status).toBe(
      "passed"
    );
    expect(first.checkpoints.find((item) => item.id === "adapt")?.status).toBe(
      "pending"
    );

    const app = getApp(WORKSHOP_APP_ID);
    expect(app?.origin).toBe("user-created");
    const tableId = app?.manifest.tables[0]?.id;
    expect(tableId).toBeTruthy();
    await addRows(tableId!, [
      {
        data: {
          title: "Learner-owned client intake",
          description: "A bounded real process adapted during the workshop.",
          status: "Draft",
          owner: "Operator",
          impact: 84,
        },
        createdBy: "user",
      },
    ]);

    const rehearsed = await runDeterministicWorkshopFallback(first.id);
    expect(rehearsed.fallbackUsed).toBe(true);
    expect(rehearsed.receiptId).toBeTruthy();
    expect(rehearsed.checkpoints.find((item) => item.id === "adapt")?.status).toBe(
      "passed"
    );
    expect(rehearsed.checkpoints.find((item) => item.id === "run")?.detail).toBe(
      "Operations Receipt verdict: passed."
    );

    const externalDir = mkdtempSync(join(tmpdir(), "relay-workshop-external-"));
    const externalFile = join(externalDir, "outside.txt");
    writeFileSync(externalFile, "must not be exported");
    const linkedOutputDir = join(dataDir(), "workshop", "symlink-test");
    mkdirSync(linkedOutputDir, { recursive: true });
    const linkedOutput = join(linkedOutputDir, "outside.txt");
    symlinkSync(externalFile, linkedOutput);
    db.insert(documents)
      .values({
        id: "workshop-symlink-output",
        projectId: first.projectId!,
        filename: "outside.txt",
        originalName: "outside.txt",
        mimeType: "text/plain",
        size: 20,
        storagePath: linkedOutput,
        version: 1,
        direction: "output",
        category: "workshop-evidence",
        status: "ready",
        source: "workshop-symlink-test",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();

    const firstBundle = await buildWorkshopCompletionBundle(first.id);
    const completed = await getWorkshopRun(first.id);
    expect(completed.status).toBe("completed");
    expect(
      completed.checkpoints.find((item) => item.id === "retain")?.status
    ).toBe("passed");

    const secondBundle = await buildWorkshopCompletionBundle(first.id);
    expect(secondBundle.equals(firstBundle)).toBe(true);

    const zip = await JSZip.loadAsync(firstBundle);
    expect(
      Object.values(zip.files).every(
        (file) => file.date.toISOString() === "2000-01-01T00:00:00.000Z"
      )
    ).toBe(true);
    const manifest = JSON.parse(
      await zip.file("completion/manifest.json")!.async("string")
    );
    const receipt = JSON.parse(
      await zip.file("completion/operations-receipt.json")!.async("string")
    );
    const limitations = await zip
      .file("completion/limitations.md")!
      .async("string");
    expect(manifest.workshop.fallbackUsed).toBe(true);
    expect(receipt.verdict).toBe("passed");
    expect(limitations).toContain("no model/provider call occurred");
    expect(limitations).toContain("1 output(s) were omitted");
    expect(firstBundle.toString("utf8")).not.toContain("must not be exported");
    expect(
      Object.keys(zip.files).some((name) =>
        name.startsWith("capstone-pack/base/")
      )
    ).toBe(true);
    expect(firstBundle.toString("utf8")).not.toContain("/Users/");
    rmSync(externalDir, { recursive: true, force: true });
  });
});
