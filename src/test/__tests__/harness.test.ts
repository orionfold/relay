/** @vitest-environment node */

import {
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertHarnessOwnedRoot,
  createHarnessRoot,
  createWorkerDataDir,
  removeHarnessRoot,
  TestHarnessConfigurationError,
} from "../harness";

const disposableRoots: Array<{ root: string; nonce: string }> = [];

function ownedRoot() {
  const harness = createHarnessRoot();
  disposableRoots.push(harness);
  return harness;
}

afterEach(() => {
  for (const harness of disposableRoots.splice(0)) {
    if (existsSync(harness.root)) removeHarnessRoot(harness.root, harness.nonce);
  }
});

describe("Relay test harness ownership", () => {
  it("replaces application data with a worker-owned child of the marked root", () => {
    const root = process.env.RELAY_TEST_HARNESS_ROOT;
    const dataDir = process.env.RELAY_DATA_DIR;

    expect(root).toBeTruthy();
    expect(dataDir).toBeTruthy();
    expect(assertHarnessOwnedRoot(root!)).toMatchObject({
      schema: "relay-test-harness/v1",
    });
    expect(relative(root!, dataDir!)).toMatch(/^worker-[A-Za-z0-9._-]+$/);
  });

  it("creates distinct Windows-safe directories for distinct workers", () => {
    const { root } = ownedRoot();
    const first = createWorkerDataDir(root, "1");
    const second = createWorkerDataDir(root, "2:windows/unsafe\\id");

    expect(first).not.toBe(second);
    expect(basename(second)).toBe("worker-2_windows_unsafe_id");
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
  });

  it("refuses an arbitrary temporary directory before creating worker state", () => {
    const unsafeRoot = join(tmpdir(), `relay-unsafe-${process.pid}-${Date.now()}`);
    mkdirSync(unsafeRoot);
    writeFileSync(join(unsafeRoot, "sentinel"), "operator data\n");

    expect(() => createWorkerDataDir(unsafeRoot, "1")).toThrowError(
      TestHarnessConfigurationError
    );
    expect(existsSync(join(unsafeRoot, "worker-1"))).toBe(false);
    expect(() => removeHarnessRoot(unsafeRoot, "forged")).toThrowError(
      TestHarnessConfigurationError
    );

    // This path was created by this test, but it deliberately lacks a harness
    // ownership marker and therefore cannot use the production cleanup helper.
    const marker = join(unsafeRoot, "sentinel");
    expect(existsSync(marker)).toBe(true);
    // Keep cleanup explicit and bounded to the exact test-created files.
    rmSync(unsafeRoot, { recursive: true });
  });

  it("refuses a correctly named root with a forged or missing marker", () => {
    const forged = join(
      realpathSync(tmpdir()),
      `relay-vitest-forged-${process.pid}-${Date.now()}`
    );
    mkdirSync(forged);
    expect(() => assertHarnessOwnedRoot(forged)).toThrowError(
      /Refusing unmarked Relay test harness root/
    );
    rmSync(forged, { recursive: true });
  });

  it("removes only the root carrying the expected ownership nonce", () => {
    const harness = ownedRoot();
    expect(() => removeHarnessRoot(harness.root, "wrong-nonce")).toThrowError(
      /ownership nonce does not match/
    );
    expect(existsSync(harness.root)).toBe(true);

    removeHarnessRoot(harness.root, harness.nonce);
    expect(existsSync(harness.root)).toBe(false);
  });
});

describe.sequential("test-local process state", () => {
  const harnessDataDir = process.env.RELAY_DATA_DIR;

  it("allows a test to stub environment and global state", () => {
    vi.stubEnv("RELAY_DATA_DIR", join(tmpdir(), "deliberate-test-stub"));
    vi.stubGlobal("__relayHarnessLeakProbe", true);
    expect(process.env.RELAY_DATA_DIR).not.toBe(harnessDataDir);
    expect(
      (globalThis as typeof globalThis & { __relayHarnessLeakProbe?: boolean })
        .__relayHarnessLeakProbe
    ).toBe(true);
  });

  it("restores stubbed environment and global state after each test", () => {
    expect(process.env.RELAY_DATA_DIR).toBe(harnessDataDir);
    expect(
      (globalThis as typeof globalThis & { __relayHarnessLeakProbe?: boolean })
        .__relayHarnessLeakProbe
    ).toBeUndefined();
  });
});
