// src/lib/plugins/__tests__/blueprint-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { reloadPlugins } from "../registry";
import { getBlueprint, clearAllPluginBlueprints } from "@/lib/workflows/blueprints/registry";
import { clearAllPluginProfiles } from "@/lib/agents/profiles/registry";

let tmpDir: string;

// Fixture-vs-spec note: BlueprintSchema requires `version` (semver),
// `difficulty ∈ {beginner|intermediate|advanced}` (no "easy"), `estimatedDuration`
// as a string, steps with `name` + `requiresApproval` + `promptTemplate` (not
// `prompt`), and `steps.min(1)`. The plan-document fixture omits/mismatches
// these; the YAML below corrects them so the schema accepts the bundle and the
// test exercises the *integration* (cross-ref validation, namespacing) rather
// than re-testing schema validation.
function writeBundle(pluginId: string, opts: {
  profiles?: Array<{ id: string; name: string }>;
  blueprints?: Array<{ id: string; profileRef?: string }>;
}) {
  const root = path.join(tmpDir, "plugins", pluginId);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(
    path.join(root, "plugin.yaml"),
    yaml.dump({ id: pluginId, version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
  );
  for (const p of opts.profiles ?? []) {
    const dir = path.join(root, "profiles", p.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "profile.yaml"), yaml.dump({
      id: p.id, name: p.name, domain: "personal", tags: [], allowedTools: [], mcpServers: {}, version: "0.1.0",
    }));
    fs.writeFileSync(path.join(dir, "SKILL.md"), `# ${p.name}`);
  }
  if (opts.blueprints) {
    fs.mkdirSync(path.join(root, "blueprints"), { recursive: true });
    for (const bp of opts.blueprints) {
      fs.writeFileSync(path.join(root, "blueprints", `${bp.id}.yaml`), yaml.dump({
        id: bp.id,
        name: bp.id,
        description: "test",
        version: "0.1.0",
        domain: "personal",
        pattern: "sequence",
        tags: [],
        difficulty: "beginner",
        estimatedDuration: "5m",
        variables: [],
        steps: bp.profileRef
          ? [{ name: "Step 1", profileId: bp.profileRef, promptTemplate: "do work", requiresApproval: false }]
          : [{ name: "Step 1", profileId: "general", promptTemplate: "do work", requiresApproval: false }],
      }));
    }
  }
}

describe("plugin loader → blueprint integration", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-blueprints-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    clearAllPluginProfiles();
    clearAllPluginBlueprints();
    await reloadPlugins();
  });
  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearAllPluginProfiles();
    clearAllPluginBlueprints();
    await reloadPlugins();
  });

  it("registers blueprints with namespaced ids when refs resolve", async () => {
    writeBundle("finance-pack", {
      profiles: [{ id: "personal-cfo", name: "CFO" }],
      blueprints: [{ id: "monthly-close", profileRef: "finance-pack/personal-cfo" }],
    });
    const [plugin] = await reloadPlugins();
    expect(plugin.blueprints).toEqual(["finance-pack/monthly-close"]);
    expect(getBlueprint("finance-pack/monthly-close")).toBeTruthy();
  });

  it("skips a blueprint with unresolved cross-plugin reference", async () => {
    writeBundle("alpha", {
      blueprints: [{ id: "x", profileRef: "beta/some-profile" }],
    });
    const [plugin] = await reloadPlugins();
    expect(plugin.status).toBe("loaded"); // bundle still loaded
    expect(plugin.blueprints).toEqual([]); // but blueprint skipped
  });
});
