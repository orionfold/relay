// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HOISTED_RUNTIME_INPUTS,
  HoistedWorkspaceSyncError,
  areHoistedWorkspaceInputsCurrent,
  syncHoistedWorkspaceInputs,
} from "../hoisted-workspace";

const cleanups: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "relay-hoisted-workspace-"));
  cleanups.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of cleanups.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function writeInputs(appDir: string, version: string, marker: string): void {
  mkdirSync(join(appDir, "src"), { recursive: true });
  mkdirSync(join(appDir, "public"), { recursive: true });
  writeFileSync(join(appDir, "src", "marker.txt"), marker);
  writeFileSync(join(appDir, "public", "marker.txt"), marker);
  for (const name of HOISTED_RUNTIME_INPUTS) {
    if (name === "src" || name === "public") {
      continue;
    }
    writeFileSync(join(appDir, name), `${name}:${marker}`);
  }
  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify({ name: "orionfold-relay", version }),
  );
}

describe("syncHoistedWorkspaceInputs", () => {
  it("treats malformed and structurally invalid hoist manifests as stale", () => {
    const dir = tempDir();
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(hoistedRoot, { recursive: true });
    writeFileSync(join(hoistedRoot, ".relay-runtime-inputs.json"), "{");
    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "1.2.3")).toBe(false);

    writeFileSync(
      join(hoistedRoot, ".relay-runtime-inputs.json"),
      JSON.stringify({
        schemaVersion: 2,
        packageVersion: "1.2.3",
        inputs: [42],
      }),
    );
    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "1.2.3")).toBe(false);
  });

  it("rejects missing, malformed, and non-string package versions", () => {
    const dir = tempDir();
    const appDir = join(dir, "package");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });

    for (const packageJson of ["{", JSON.stringify({ version: 123 })]) {
      writeFileSync(join(appDir, "package.json"), packageJson);
      expect(() =>
        syncHoistedWorkspaceInputs({
          appDir,
          hoistedRoot,
          packageVersion: "1.2.3",
        }),
      ).toThrow(/version mismatch/i);
    }
  });

  it("copies the complete versioned runtime input set and writes the manifest last", () => {
    const dir = tempDir();
    const appDir = join(dir, "package");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });
    writeInputs(appDir, "1.2.3", "new");
    writeFileSync(
      join(hoistedRoot, "package.json"),
      JSON.stringify({ name: "customer-project", private: true }),
    );

    expect(
      syncHoistedWorkspaceInputs({
        appDir,
        hoistedRoot,
        packageVersion: "1.2.3",
      }),
    ).toBe("synchronized");

    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "1.2.3")).toBe(true);
    expect(readFileSync(join(hoistedRoot, "src", "marker.txt"), "utf-8")).toBe(
      "new",
    );
    expect(
      JSON.parse(readFileSync(join(hoistedRoot, "package.json"), "utf-8")),
    ).toEqual({ name: "customer-project", private: true });
  });

  it("does not rewrite an already-current input set", () => {
    const dir = tempDir();
    const appDir = join(dir, "package");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });
    writeInputs(appDir, "1.2.3", "first");
    syncHoistedWorkspaceInputs({
      appDir,
      hoistedRoot,
      packageVersion: "1.2.3",
    });
    writeFileSync(join(appDir, "src", "marker.txt"), "changed-source");

    expect(
      syncHoistedWorkspaceInputs({
        appDir,
        hoistedRoot,
        packageVersion: "1.2.3",
      }),
    ).toBe("already-current");
    expect(readFileSync(join(hoistedRoot, "src", "marker.txt"), "utf-8")).toBe(
      "first",
    );
  });

  it("repairs a corrupt manifest without changing the containing project", () => {
    const dir = tempDir();
    const appDir = join(dir, "package");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });
    writeInputs(appDir, "1.2.3", "current");
    syncHoistedWorkspaceInputs({
      appDir,
      hoistedRoot,
      packageVersion: "1.2.3",
    });
    const parentPackage = JSON.stringify({
      name: "customer-project",
      version: "0.0.1",
    });
    writeFileSync(join(hoistedRoot, "package.json"), parentPackage);
    writeFileSync(
      join(hoistedRoot, ".relay-runtime-inputs.json"),
      JSON.stringify({
        schemaVersion: 1,
        packageVersion: "1.2.3",
        inputs: ["src"],
      }),
    );

    expect(
      syncHoistedWorkspaceInputs({
        appDir,
        hoistedRoot,
        packageVersion: "1.2.3",
      }),
    ).toBe("synchronized");
    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "1.2.3")).toBe(true);
    expect(
      readFileSync(join(hoistedRoot, "package.json"), "utf-8"),
    ).toBe(parentPackage);
  });

  it("replaces every stale input when the package version advances", () => {
    const dir = tempDir();
    const appDir = join(dir, "package");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });
    writeInputs(appDir, "1.0.0", "old");
    syncHoistedWorkspaceInputs({
      appDir,
      hoistedRoot,
      packageVersion: "1.0.0",
    });

    rmSync(appDir, { recursive: true, force: true });
    mkdirSync(appDir, { recursive: true });
    writeInputs(appDir, "2.0.0", "new");
    syncHoistedWorkspaceInputs({
      appDir,
      hoistedRoot,
      packageVersion: "2.0.0",
    });

    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "1.0.0")).toBe(false);
    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "2.0.0")).toBe(true);
    for (const name of ["src", "public"]) {
      expect(readFileSync(join(hoistedRoot, name, "marker.txt"), "utf-8")).toBe(
        "new",
      );
    }
  });

  it("rolls every input and the manifest back when promotion fails", () => {
    const dir = tempDir();
    const oldAppDir = join(dir, "package-old");
    const newAppDir = join(dir, "package-new");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(oldAppDir, { recursive: true });
    mkdirSync(newAppDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });
    writeInputs(oldAppDir, "1.0.0", "old");
    writeInputs(newAppDir, "2.0.0", "new");
    syncHoistedWorkspaceInputs({
      appDir: oldAppDir,
      hoistedRoot,
      packageVersion: "1.0.0",
    });
    const oldManifest = readFileSync(
      join(hoistedRoot, ".relay-runtime-inputs.json"),
      "utf-8",
    );

    const now = 123_456_789;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const blocker = join(dir, "manifest-write-blocker");
    mkdirSync(blocker);
    symlinkSync(
      blocker,
      join(
        hoistedRoot,
        `.relay-runtime-inputs.json.tmp-${process.pid}-${now}`,
      ),
    );

    expect(() =>
      syncHoistedWorkspaceInputs({
        appDir: newAppDir,
        hoistedRoot,
        packageVersion: "2.0.0",
      }),
    ).toThrow(HoistedWorkspaceSyncError);

    expect(readFileSync(join(hoistedRoot, "src", "marker.txt"), "utf-8")).toBe(
      "old",
    );
    expect(
      readFileSync(join(hoistedRoot, ".relay-runtime-inputs.json"), "utf-8"),
    ).toBe(oldManifest);
    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "1.0.0")).toBe(true);
    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "2.0.0")).toBe(false);
  });

  it("fails before mutation when a required packaged input is missing", () => {
    const dir = tempDir();
    const appDir = join(dir, "package");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });
    writeInputs(appDir, "1.2.3", "new");
    rmSync(join(appDir, "public"), { recursive: true, force: true });
    writeFileSync(join(hoistedRoot, "sentinel"), "preserved");

    expect(() =>
      syncHoistedWorkspaceInputs({
        appDir,
        hoistedRoot,
        packageVersion: "1.2.3",
      }),
    ).toThrow(HoistedWorkspaceSyncError);
    expect(readFileSync(join(hoistedRoot, "sentinel"), "utf-8")).toBe(
      "preserved",
    );
    expect(existsSync(join(hoistedRoot, ".relay-runtime-inputs.json"))).toBe(
      false,
    );
  });

  it("rejects a staged package version mismatch without replacing old inputs", () => {
    const dir = tempDir();
    const appDir = join(dir, "package");
    const hoistedRoot = join(dir, "npx-root");
    mkdirSync(appDir, { recursive: true });
    mkdirSync(hoistedRoot, { recursive: true });
    writeInputs(appDir, "1.0.0", "old");
    syncHoistedWorkspaceInputs({
      appDir,
      hoistedRoot,
      packageVersion: "1.0.0",
    });

    rmSync(appDir, { recursive: true, force: true });
    mkdirSync(appDir, { recursive: true });
    writeInputs(appDir, "2.0.0", "new");

    expect(() =>
      syncHoistedWorkspaceInputs({
        appDir,
        hoistedRoot,
        packageVersion: "3.0.0",
      }),
    ).toThrow(/version mismatch/i);
    expect(readFileSync(join(hoistedRoot, "src", "marker.txt"), "utf-8")).toBe(
      "old",
    );
    expect(areHoistedWorkspaceInputsCurrent(hoistedRoot, "1.0.0")).toBe(true);
  });
});
