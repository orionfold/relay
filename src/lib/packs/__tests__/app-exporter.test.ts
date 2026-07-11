import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  schedules,
  userTableColumns,
  userTableRows,
  userTables,
} from "@/lib/db/schema";
import { createTable, addRows, getColumns, listTables } from "@/lib/data/tables";
import {
  getAinativeAppsDir,
  getAinativeBlueprintsDir,
  getAinativeProfilesDir,
} from "@/lib/utils/ainative-paths";
import { AppManifestSchema, getApp } from "@/lib/apps/registry";
import { installPack } from "../install";
import { buildAppPackArtifact, exportAppPackToDirectory } from "../app-exporter";

const APP_ID = "exporter-test-pack";
const PROFILE_ID = `${APP_ID}--analyst`;
const BLUEPRINT_ID = `${APP_ID}--refresh`;
const SCHEDULE_ID = "exporter-test-schedule-row";
let tableId = "";

async function removeRuntimeApp(): Promise<void> {
  db.delete(schedules).where(eq(schedules.projectId, APP_ID)).run();
  const ownedTables = db
    .select({ id: userTables.id })
    .from(userTables)
    .where(eq(userTables.projectId, APP_ID))
    .all();
  for (const table of ownedTables) {
    db.delete(userTableRows).where(eq(userTableRows.tableId, table.id)).run();
    db.delete(userTableColumns).where(eq(userTableColumns.tableId, table.id)).run();
    db.delete(userTables).where(eq(userTables.id, table.id)).run();
  }
  db.delete(projects).where(eq(projects.id, APP_ID)).run();
  fs.rmSync(path.join(getAinativeAppsDir(), APP_ID), { recursive: true, force: true });
  fs.rmSync(path.join(getAinativeProfilesDir(), PROFILE_ID), { recursive: true, force: true });
  fs.rmSync(path.join(getAinativeBlueprintsDir(), `${BLUEPRINT_ID}.yaml`), { force: true });
}

function artifactText(
  files: Awaited<ReturnType<typeof buildAppPackArtifact>>["files"],
  filePath: string
): string {
  const file = files.find((entry) => entry.path === filePath);
  if (!file) throw new Error(`Missing artifact file ${filePath}`);
  return Buffer.isBuffer(file.content) ? file.content.toString("utf-8") : file.content;
}

describe("buildAppPackArtifact", () => {
  beforeEach(async () => {
    const now = new Date();
    db.insert(projects)
      .values({
        id: APP_ID,
        name: "Exporter Test Pack",
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const table = await createTable({
      name: "Metrics",
      description: "Owned operating metrics",
      projectId: APP_ID,
      columns: [
        {
          name: "amount",
          displayName: "Amount",
          dataType: "number",
          position: 0,
          required: true,
        },
      ],
    });
    tableId = table.id;
    await addRows(tableId, [{ data: { amount: 42 }, createdBy: "user" }]);

    const profileDir = path.join(getAinativeProfilesDir(), PROFILE_ID);
    fs.mkdirSync(profileDir, { recursive: true });
    fs.writeFileSync(path.join(profileDir, "agent.yaml"), "id: exporter-test-pack--analyst\nname: Analyst\nversion: 1.0.0\ndomain: work\ntags: [test]\n");
    fs.writeFileSync(path.join(profileDir, "SKILL.md"), "# Analyst\n");
    fs.mkdirSync(getAinativeBlueprintsDir(), { recursive: true });
    fs.writeFileSync(
      path.join(getAinativeBlueprintsDir(), `${BLUEPRINT_ID}.yaml`),
      `id: ${BLUEPRINT_ID}\nname: Refresh\ndescription: Refresh metrics\nversion: 1.0.0\ndomain: work\ntags: [test]\npattern: sequence\nvariables: []\nsteps:\n  - name: refresh\n    profileId: ${PROFILE_ID}\n    promptTemplate: Refresh\n    requiresApproval: false\n`
    );
    db.insert(schedules)
      .values({
        id: SCHEDULE_ID,
        projectId: APP_ID,
        name: "Daily Refresh",
        prompt: "Runs app blueprint",
        cronExpression: "0 8 * * *",
        recurs: true,
        status: "active",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const manifest = AppManifestSchema.parse({
      id: APP_ID,
      version: "0.1.0",
      name: "Exporter Test Pack",
      description: "A community-authored operating system",
      profiles: [{ id: PROFILE_ID }],
      blueprints: [
        {
          id: BLUEPRINT_ID,
          trigger: { kind: "row-insert", table: tableId },
        },
      ],
      tables: [{ id: tableId, columns: ["amount"] }],
      schedules: [
        { id: SCHEDULE_ID, cron: "0 8 * * *", runs: BLUEPRINT_ID },
      ],
      view: {
        kit: "tracker",
        bindings: {
          hero: { table: tableId },
          cadence: { schedule: SCHEDULE_ID },
        },
      },
    });
    const appDir = path.join(getAinativeAppsDir(), APP_ID);
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(appDir, "manifest.yaml"), yaml.dump(manifest));
  });

  afterEach(async () => {
    await removeRuntimeApp();
    vi.unstubAllGlobals();
  });

  it("reverses runtime ids, preserves table types, and excludes rows by default", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("exporter attempted network egress");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const artifact = await buildAppPackArtifact(APP_ID);
    const manifest = yaml.load(artifactText(artifact.files, "base/manifest.yaml")) as {
      tables: Array<Record<string, unknown>>;
      blueprints: Array<{ trigger: { table: string } }>;
      schedules: Array<{ id: string }>;
      view: { bindings: { hero: { table: string }; cadence: { schedule: string } } };
    };

    expect(manifest.tables[0]).toMatchObject({
      id: `${APP_ID}--metrics`,
      name: "Metrics",
      description: "Owned operating metrics",
      columns: ["amount"],
      columnDefinitions: [expect.objectContaining({ dataType: "number", required: true })],
    });
    expect(manifest.blueprints[0].trigger.table).toBe(`${APP_ID}--metrics`);
    expect(manifest.schedules[0].id).toBe(`${APP_ID}--daily-refresh`);
    expect(manifest.view.bindings.hero.table).toBe(`${APP_ID}--metrics`);
    expect(manifest.view.bindings.cadence.schedule).toBe(
      `${APP_ID}--daily-refresh`
    );
    expect(artifact.files.some((file) => file.path.includes("seed/tables"))).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("includes a bounded seed file only when explicitly requested", async () => {
    const artifact = await buildAppPackArtifact(APP_ID, { includeSampleData: true });
    expect(artifact.sampleRowsIncluded).toBe(1);
    expect(
      JSON.parse(
        artifactText(
          artifact.files,
          `base/seed/tables/${APP_ID}--metrics.json`
        )
      )
    ).toEqual([{ amount: 42 }]);
  });

  it("round-trips through pack install with stable refs and typed table columns", async () => {
    const outputDir = path.join(process.env.RELAY_DATA_DIR!, "test-exports", APP_ID);
    await exportAppPackToDirectory(APP_ID, { outputDir });
    await removeRuntimeApp();

    await installPack(outputDir, { coreVersion: "0.36.5" });

    const installed = getApp(APP_ID);
    expect(installed).not.toBeNull();
    const tables = await listTables({ projectId: APP_ID });
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe("Metrics");
    const columns = await getColumns(tables[0].id);
    expect(columns[0]).toMatchObject({
      name: "amount",
      displayName: "Amount",
      dataType: "number",
      required: true,
    });
    expect(installed!.manifest.view?.bindings.hero).toEqual({ table: tables[0].id });
    expect(installed!.manifest.blueprints[0].trigger?.table).toBe(tables[0].id);
    expect(installed!.manifest.schedules[0].id).toBe(
      `app:${APP_ID}:${APP_ID}--daily-refresh`
    );
    fs.rmSync(path.dirname(outputDir), { recursive: true, force: true });
  });
});
