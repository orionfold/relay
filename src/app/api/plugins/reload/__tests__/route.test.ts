// src/app/api/plugins/reload/__tests__/route.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { POST } from "../route";

let tmpDir: string;

describe("POST /api/plugins/reload", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "api-reload-"));
    process.env.RELAY_DATA_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns loaded/disabled summary", async () => {
    fs.mkdirSync(path.join(tmpDir, "plugins", "demo"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "plugins", "demo", "plugin.yaml"),
      yaml.dump({ id: "demo", version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
    );
    const res = await POST();
    const body = await res.json();
    expect(body.loaded).toEqual(expect.arrayContaining([expect.objectContaining({ id: "demo" })]));
    expect(body.disabled).toEqual([]);
  });
});
