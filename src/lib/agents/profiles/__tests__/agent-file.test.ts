import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AGENT_FILENAME,
  LEGACY_PROFILE_FILENAME,
  resolveAgentFile,
  hasAgentFile,
} from "../agent-file";

describe("agent-file resolver (dual-read agent.yaml / profile.yaml)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-file-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("exposes the new + legacy filenames", () => {
    expect(AGENT_FILENAME).toBe("agent.yaml");
    expect(LEGACY_PROFILE_FILENAME).toBe("profile.yaml");
  });

  it("returns null when neither manifest exists", () => {
    expect(resolveAgentFile(dir)).toBeNull();
    expect(hasAgentFile(dir)).toBe(false);
  });

  it("resolves a legacy profile.yaml when it is the only manifest", () => {
    const legacy = path.join(dir, LEGACY_PROFILE_FILENAME);
    fs.writeFileSync(legacy, "id: x");
    expect(resolveAgentFile(dir)).toBe(legacy);
    expect(hasAgentFile(dir)).toBe(true);
  });

  it("resolves agent.yaml when it is the only manifest", () => {
    const agentPath = path.join(dir, AGENT_FILENAME);
    fs.writeFileSync(agentPath, "id: x");
    expect(resolveAgentFile(dir)).toBe(agentPath);
  });

  it("prefers agent.yaml over a lingering legacy profile.yaml", () => {
    fs.writeFileSync(path.join(dir, LEGACY_PROFILE_FILENAME), "id: old");
    const agentPath = path.join(dir, AGENT_FILENAME);
    fs.writeFileSync(agentPath, "id: new");
    expect(resolveAgentFile(dir)).toBe(agentPath);
  });
});
