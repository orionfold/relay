import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { seedExamplePluginsIfEmpty } from "../seed";

let tmpDir: string;

describe("seedExamplePluginsIfEmpty", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-seed-"));
    process.env.RELAY_DATA_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies example plugins into a fresh plugins/ directory", () => {
    seedExamplePluginsIfEmpty();
    expect(fs.existsSync(path.join(tmpDir, "plugins", "finance-pack", "plugin.yaml"))).toBe(true);
  });

  it("copies echo-server dogfood plugin on first-boot", () => {
    seedExamplePluginsIfEmpty();
    const echoDir = path.join(tmpDir, "plugins", "echo-server");
    expect(fs.existsSync(echoDir)).toBe(true);
    expect(fs.existsSync(path.join(echoDir, "plugin.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(echoDir, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(echoDir, "server.py"))).toBe(true);
  });

  it("does NOT overwrite when plugins/ already has a subdirectory", () => {
    const existing = path.join(tmpDir, "plugins", "user-pack");
    fs.mkdirSync(existing, { recursive: true });
    fs.writeFileSync(path.join(existing, "plugin.yaml"), "existing");
    seedExamplePluginsIfEmpty();
    expect(fs.existsSync(path.join(tmpDir, "plugins", "finance-pack"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "plugins", "echo-server"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, "plugins", "reading-radar"))).toBe(false);
    expect(fs.readFileSync(path.join(existing, "plugin.yaml"), "utf-8")).toBe("existing");
  });

  it("is idempotent — second call after first does not duplicate", () => {
    seedExamplePluginsIfEmpty();
    seedExamplePluginsIfEmpty();
    const items = fs.readdirSync(path.join(tmpDir, "plugins"));
    expect(items.sort()).toEqual(["echo-server", "finance-pack", "reading-radar"]);
  });
});
