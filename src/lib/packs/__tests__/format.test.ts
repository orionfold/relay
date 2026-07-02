import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { packPrice, parsePack, PackValidationError } from "../format";

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

describe("pack.yaml price field (flat string | {list, intro?, note?})", () => {
  it("still accepts the flat price string (back-compat, every shipped pack)", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      price: "$499/year",
    });

    const pack = parsePack(packDir);
    expect(pack.meta.price).toBe("$499/year");
  });

  it("accepts the two-phase object shape with founding intro + list + note", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      price: {
        list: "$499/year",
        intro: "$349/year",
        note: "Founding price for early buyers",
      },
    });

    const pack = parsePack(packDir);
    expect(pack.meta.price).toEqual({
      list: "$499/year",
      intro: "$349/year",
      note: "Founding price for early buyers",
    });
  });

  it("accepts the object shape with list only (intro and note optional)", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      price: { list: "$499/year" },
    });

    const pack = parsePack(packDir);
    expect(pack.meta.price).toEqual({ list: "$499/year" });
  });

  it("rejects an object price missing list (intro alone is not an offer)", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      price: { intro: "$349/year" },
    });

    expect(() => parsePack(packDir)).toThrow(PackValidationError);
  });

  it("rejects unknown keys inside the object price (strict, like the wrapper)", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      price: { list: "$499/year", forever: "$999" },
    });

    expect(() => parsePack(packDir)).toThrow(PackValidationError);
  });
});

describe("packPrice normalizer (single shape for every render site)", () => {
  it("normalizes a flat string to { list }", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      price: "$499/year",
    });

    expect(packPrice(parsePack(packDir).meta)).toEqual({ list: "$499/year" });
  });

  it("passes the object shape through unchanged", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      price: { list: "$499/year", intro: "$349/year" },
    });

    expect(packPrice(parsePack(packDir).meta)).toEqual({
      list: "$499/year",
      intro: "$349/year",
    });
  });

  it("returns null when the pack has no price (free pack)", () => {
    writePack({ id: "test-pack", version: "0.1.0", name: "Test Pack" });

    expect(packPrice(parsePack(packDir).meta)).toBeNull();
  });
});

describe("pack.yaml icon field", () => {
  it("accepts an optional icon token for per-pack card identity", () => {
    writePack({
      id: "test-pack",
      version: "0.1.0",
      name: "Test Pack",
      icon: "briefcase",
    });

    expect(parsePack(packDir).meta.icon).toBe("briefcase");
  });
});
