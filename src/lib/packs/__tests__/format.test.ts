import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { parsePack, PackValidationError } from "../format";

let packDir: string;

beforeEach(() => {
  packDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-pack-format-"));
});

afterEach(() => {
  fs.rmSync(packDir, { recursive: true, force: true });
});

function writePack(meta: Record<string, unknown>): void {
  fs.writeFileSync(path.join(packDir, "pack.yaml"), yaml.dump(meta));
  const baseDir = path.join(packDir, "base");
  fs.mkdirSync(baseDir, { recursive: true });
  fs.writeFileSync(
    path.join(baseDir, "manifest.yaml"),
    yaml.dump({ id: String(meta.id), name: String(meta.name) })
  );
}

describe("pack.yaml changelog field", () => {
  it("accepts an optional changelog map of version → customer-voice line", () => {
    writePack({
      id: "test-pack",
      version: "0.2.0",
      name: "Test Pack",
      changelog: {
        "0.1.0": "The first six chapters.",
        "0.2.0": "The nonprofit deep chapter — grant pipeline end to end.",
      },
    });

    const pack = parsePack(packDir);
    expect(pack.meta.changelog).toEqual({
      "0.1.0": "The first six chapters.",
      "0.2.0": "The nonprofit deep chapter — grant pipeline end to end.",
    });
  });

  it("still validates a pack.yaml with no changelog (field stays optional)", () => {
    writePack({ id: "test-pack", version: "0.1.0", name: "Test Pack" });

    const pack = parsePack(packDir);
    expect(pack.meta.changelog).toBeUndefined();
  });

  it("rejects an empty changelog line (a blank recap is worse than none)", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      changelog: { "0.1.0": "" },
    });

    expect(() => parsePack(packDir)).toThrow(PackValidationError);
  });
});
