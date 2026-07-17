// @vitest-environment node
import { randomBytes } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import { createRecoveryKeyFile } from "@/lib/recovery/key";
import { getAinativeDataDir } from "@/lib/utils/ainative-paths";
import { GET, POST } from "../route";
import { POST as verify } from "../verify/route";
import { POST as drill } from "../drill/route";

describe("recovery API", () => {
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "relay-recovery-route-"));
    process.env.RELAY_CELL_ID = "route-cell";
    process.env.RELAY_RECOVERY_DESTINATION = join(root, "bundles");
    process.env.RELAY_RECOVERY_KEY_FILE = join(root, "keys", "route-cell.key");
    createRecoveryKeyFile(process.env.RELAY_RECOVERY_KEY_FILE);
    await db.delete(snapshots);
    rmSync(join(getAinativeDataDir(), "snapshots"), { recursive: true, force: true });
    rmSync(join(getAinativeDataDir(), "recovery"), { recursive: true, force: true });
    mkdirSync(join(getAinativeDataDir(), "uploads"), { recursive: true });
    writeFileSync(join(getAinativeDataDir(), "uploads", "route.txt"), "route recovery");
    writeFileSync(join(getAinativeDataDir(), ".keyfile"), randomBytes(32), { mode: 0o600 });
  });

  afterEach(() => {
    for (const key of ["RELAY_CELL_ID", "RELAY_RECOVERY_DESTINATION", "RELAY_RECOVERY_KEY_FILE"]) delete process.env[key];
    rmSync(root, { recursive: true, force: true });
  });

  it("creates and verifies a configured recovery bundle without returning key paths", async () => {
    const created = await POST();
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.receipt.status).toBe("ready");
    expect(JSON.stringify(body)).not.toContain(process.env.RELAY_RECOVERY_KEY_FILE);
    expect(JSON.stringify(body)).not.toContain(process.env.RELAY_RECOVERY_DESTINATION);

    const verified = await verify(new NextRequest("http://relay.test/api/recovery/verify", {
      method: "POST",
      body: JSON.stringify({ bundleFile: body.receipt.bundleFile }),
      headers: { "content-type": "application/json" },
    }));
    expect(verified.status).toBe(200);
    await expect(verified.json()).resolves.toMatchObject({ receipt: { reasonCode: "RECOVERY_VERIFIED" } });

    const drilled = await drill(new NextRequest("http://relay.test/api/recovery/drill", {
      method: "POST",
      body: JSON.stringify({ bundleFile: body.receipt.bundleFile }),
      headers: { "content-type": "application/json" },
    }));
    expect(drilled.status).toBe(200);
    await expect(drilled.json()).resolves.toMatchObject({ receipt: { reasonCode: "RECOVERY_DRILL_VERIFIED" } });

    const status = await GET().json();
    expect(status.keyConfigured).toBe(true);
    expect(status.destinationConfigured).toBe(true);
    expect(JSON.stringify(status)).not.toContain(process.env.RELAY_RECOVERY_KEY_FILE);
  });

  it("returns named configuration and input failures", async () => {
    delete process.env.RELAY_RECOVERY_KEY_FILE;
    const unconfigured = await POST();
    expect(unconfigured.status).toBe(409);
    await expect(unconfigured.json()).resolves.toMatchObject({ error: "RECOVERY_KEY_REQUIRED" });

    const malformed = await verify(new NextRequest("http://relay.test/api/recovery/verify", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({ error: "RECOVERY_JSON_INVALID" });
  });

  it("rejects bundle path traversal before touching the filesystem", async () => {
    const response = await verify(new NextRequest("http://relay.test/api/recovery/verify", {
      method: "POST",
      body: JSON.stringify({ bundleFile: "../other-cell.relay-recovery" }),
      headers: { "content-type": "application/json" },
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "RECOVERY_BUNDLE_NAME_INVALID" });
  });

  it("returns a named status failure when stored recovery evidence is corrupt", async () => {
    const receipts = join(getAinativeDataDir(), "recovery", "receipts");
    mkdirSync(receipts, { recursive: true });
    writeFileSync(join(receipts, "invalid.json"), "not-json");
    const response = GET();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: "RECOVERY_RECEIPT_INVALID" });
  });
});
