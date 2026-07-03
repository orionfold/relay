import { describe, it, expect, afterEach, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WorkflowBlueprint } from "../types";

// The registry captures USER_BLUEPRINTS_DIR from RELAY_DATA_DIR at MODULE LOAD
// time, so we point RELAY_DATA_DIR at a temp dir before the dynamic import and
// keep that single module instance for the whole file. Each test drives its own
// files under the shared dir and forces a clean cache via reloadBlueprints().
let dataDir: string;
let blueprintsDir: string;
let reg: typeof import("../registry");

// A minimal blueprint that PASSES BlueprintSchema — a valid version, a
// work/personal domain, and one task step (profileId + promptTemplate +
// requiresApproval are all required). An invalid file is silently skipped by
// the registry (console.warn only), which would make the self-heal look broken.
function writeBlueprint(id: string): void {
  fs.writeFileSync(
    path.join(blueprintsDir, `${id}.yaml`),
    [
      `id: ${id}`,
      `name: ${id}`,
      "description: test blueprint",
      'version: "1.0.0"',
      "domain: personal",
      "pattern: sequence",
      "difficulty: beginner",
      "tags: []",
      "variables: []",
      "steps:",
      "  - name: Step One",
      "    profileId: general",
      "    promptTemplate: do the thing",
      "    requiresApproval: false",
    ].join("\n")
  );
}

// A valid in-memory Kind-5 plugin blueprint (never written to disk).
function pluginBlueprint(id: string): WorkflowBlueprint {
  return {
    id,
    name: id,
    description: "t",
    version: "1.0.0",
    domain: "personal",
    pattern: "sequence",
    tags: [],
    difficulty: "beginner",
    variables: [],
    steps: [
      {
        name: "s1",
        profileId: "general",
        promptTemplate: "x",
        requiresApproval: false,
      },
    ],
    isBuiltin: false,
  } as unknown as WorkflowBlueprint;
}

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-bp-cache-"));
  blueprintsDir = path.join(dataDir, "blueprints");
  fs.mkdirSync(blueprintsDir, { recursive: true });
  process.env.RELAY_DATA_DIR = dataDir;
  reg = await import("../registry");
});

afterEach(() => {
  reg.clearAllPluginBlueprints();
  for (const f of fs.readdirSync(blueprintsDir)) {
    fs.rmSync(path.join(blueprintsDir, f));
  }
  reg.reloadBlueprints();
});

describe("blueprint cache self-heal (out-of-process install)", () => {
  it("picks up a file added to the user dir without an in-process reload", () => {
    // Prime the cache (server's first read).
    expect(reg.getBlueprint("added-out-of-band")).toBeUndefined();
    const before = reg.listBlueprints().length;

    // Simulate an out-of-process CLI install: a new file appears on disk. The
    // dir mtime bumps; NO reloadBlueprints() is called (a separate process did
    // the install and could not invalidate THIS process's cache).
    writeBlueprint("added-out-of-band");

    // Self-heal: the next read must detect the mtime change and rebuild.
    expect(reg.getBlueprint("added-out-of-band")).toBeTruthy();
    expect(reg.listBlueprints().length).toBe(before + 1);
  });

  it("detects a file removed from the user dir", () => {
    writeBlueprint("temp-bp");
    expect(reg.getBlueprint("temp-bp")).toBeTruthy();

    fs.rmSync(path.join(blueprintsDir, "temp-bp.yaml"));
    expect(reg.getBlueprint("temp-bp")).toBeUndefined();
  });
});

describe("plugin blueprints survive a self-heal reload", () => {
  it("keeps in-memory Kind-5 blueprints after a disk-triggered rebuild", () => {
    // Inject a plugin (Kind-5) blueprint — it lives only in memory.
    reg.mergePluginBlueprints([
      { pluginId: "finance-pack", blueprint: pluginBlueprint("finance-pack/close") },
    ]);
    expect(reg.getBlueprint("finance-pack/close")).toBeTruthy();

    // A disk write triggers the self-heal reload (loadAll scans disk only).
    // The plugin blueprint MUST survive — the regression this fix guards.
    writeBlueprint("disk-added");
    expect(reg.getBlueprint("disk-added")).toBeTruthy();
    expect(reg.getBlueprint("finance-pack/close")).toBeTruthy();
  });
});
