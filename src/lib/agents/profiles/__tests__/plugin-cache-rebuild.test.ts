import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import type { AgentProfile } from "../types";

// The registry captures SKILLS_DIR from process.env.HOME at MODULE LOAD time,
// so HOME is pointed at a temp dir before the dynamic import and that single
// module instance is kept for the whole file. Each test drives its own dirs
// under the shared skills dir; the cache is never reset by hand, because the
// signature-triggered rebuild is exactly what is under test.
let tempHome: string;
let skillsDir: string;
let originalHome: string | undefined;
let reg: typeof import("../registry");

/** A minimal in-memory Kind 5 plugin profile (never written to disk). */
function pluginProfile(id: string): AgentProfile {
  return {
    id,
    name: id,
    description: "test",
    domain: "personal",
    tags: [],
    systemPrompt: "",
    skillMd: "",
    allowedTools: [],
    mcpServers: {},
    canUseToolPolicy: "auto",
    maxTurns: 10,
    outputFormat: "text",
    version: "0.1.0",
    author: "test",
    source: "test",
    tests: [],
    importMeta: undefined,
    supportedRuntimes: ["claude"],
    preferredRuntime: "claude",
    runtimeOverrides: undefined,
    capabilityOverrides: undefined,
    origin: "manual",
  } as AgentProfile;
}

/**
 * Write an on-disk profile under the skills dir. Adding one changes what
 * getSkillsDirectorySignature() returns, which is the trigger that rebuilds the
 * cache from disk on the next read.
 */
function writeDiskProfile(id: string): void {
  const dir = path.join(skillsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "agent.yaml"),
    yaml.dump({
      id,
      name: id,
      version: "1.0.0",
      domain: "work",
      tags: [],
    })
  );
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---
name: ${id}
description: On-disk profile written to move the skills-directory signature.
---

Body.
`
  );
}

beforeAll(async () => {
  originalHome = process.env.HOME;
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "relay-profile-cache-"));
  skillsDir = path.join(tempHome, ".claude", "skills");
  fs.mkdirSync(skillsDir, { recursive: true });
  process.env.HOME = tempHome;
  reg = await import("../registry");
});

afterAll(() => {
  reg.clearAllPluginProfiles();
  process.env.HOME = originalHome;
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("plugin profiles survive a profile-cache rebuild", () => {
  it("keeps in-memory Kind 5 profiles after a skills-directory signature change", () => {
    // Prime the cache (the server's first read).
    reg.listProfiles();

    reg.mergePluginProfiles([
      {
        pluginId: "finance-pack",
        profile: pluginProfile("finance-pack/personal-cfo"),
      },
    ]);
    expect(reg.getProfile("finance-pack/personal-cfo")).toBeTruthy();

    // A disk write moves the signature, so the next read rebuilds from
    // scanProfiles(), which reads disk only. The plugin profile MUST survive —
    // that is the regression this guards.
    writeDiskProfile("disk-added-profile");

    expect(reg.getProfile("disk-added-profile")).toBeTruthy();
    expect(reg.getProfile("finance-pack/personal-cfo")).toBeTruthy();
    expect(reg.listProfiles().map((p) => p.id)).toContain(
      "finance-pack/personal-cfo"
    );
  });

  it("keeps them after an explicit reloadProfiles()", () => {
    reg.mergePluginProfiles([
      { pluginId: "ops-pack", profile: pluginProfile("ops-pack/incident-lead") },
    ]);

    reg.reloadProfiles();

    expect(reg.getProfile("ops-pack/incident-lead")).toBeTruthy();
  });

  it("still tracks ownership across a rebuild, so clearPluginProfiles works", () => {
    reg.mergePluginProfiles([
      { pluginId: "audit-pack", profile: pluginProfile("audit-pack/reviewer") },
    ]);
    expect(reg.listPluginProfileIds("audit-pack")).toEqual([
      "audit-pack/reviewer",
    ]);

    writeDiskProfile("disk-added-profile-two");
    expect(reg.getProfile("audit-pack/reviewer")).toBeTruthy();

    reg.clearPluginProfiles("audit-pack");
    expect(reg.getProfile("audit-pack/reviewer")).toBeUndefined();
    expect(reg.listPluginProfileIds("audit-pack")).toEqual([]);

    // A further rebuild must not resurrect a cleared plugin's profile.
    writeDiskProfile("disk-added-profile-three");
    expect(reg.getProfile("audit-pack/reviewer")).toBeUndefined();
  });
});
