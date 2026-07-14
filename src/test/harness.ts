import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

const HARNESS_PREFIX = "relay-vitest-";
const MARKER_FILE = ".relay-test-harness.json";
const MARKER_SCHEMA = "relay-test-harness/v1";

type HarnessMarker = {
  schema: typeof MARKER_SCHEMA;
  nonce: string;
};

export class TestHarnessConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestHarnessConfigurationError";
  }
}

function isWithin(parent: string, child: string): boolean {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent !== "" &&
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(pathFromParent)
  );
}

function readMarker(root: string): HarnessMarker {
  const markerPath = join(root, MARKER_FILE);
  let markerStat;
  try {
    markerStat = lstatSync(markerPath);
  } catch {
    throw new TestHarnessConfigurationError(
      `Refusing unmarked Relay test harness root: ${root}`
    );
  }
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) {
    throw new TestHarnessConfigurationError(
      `Relay test harness marker is not a regular file: ${markerPath}`
    );
  }

  let marker: unknown;
  try {
    marker = JSON.parse(readFileSync(markerPath, "utf8"));
  } catch {
    throw new TestHarnessConfigurationError(
      `Relay test harness marker is invalid: ${markerPath}`
    );
  }
  if (
    typeof marker !== "object" ||
    marker === null ||
    (marker as Partial<HarnessMarker>).schema !== MARKER_SCHEMA ||
    typeof (marker as Partial<HarnessMarker>).nonce !== "string" ||
    !(marker as Partial<HarnessMarker>).nonce
  ) {
    throw new TestHarnessConfigurationError(
      `Relay test harness marker has an unsupported schema: ${markerPath}`
    );
  }
  return marker as HarnessMarker;
}

export function assertHarnessOwnedRoot(
  root: string,
  expectedNonce?: string
): HarnessMarker {
  const resolvedRoot = resolve(root);
  const resolvedTemp = realpathSync(tmpdir());
  if (!isWithin(resolvedTemp, resolvedRoot)) {
    throw new TestHarnessConfigurationError(
      `Relay test harness root must be below the system temporary directory: ${root}`
    );
  }
  if (!basename(resolvedRoot).startsWith(HARNESS_PREFIX)) {
    throw new TestHarnessConfigurationError(
      `Relay test harness root has an unsafe name: ${root}`
    );
  }

  let rootStat;
  try {
    rootStat = lstatSync(resolvedRoot);
  } catch {
    throw new TestHarnessConfigurationError(
      `Relay test harness root does not exist: ${root}`
    );
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new TestHarnessConfigurationError(
      `Relay test harness root is not a real directory: ${root}`
    );
  }
  if (realpathSync(resolvedRoot) !== resolvedRoot) {
    throw new TestHarnessConfigurationError(
      `Relay test harness root resolves through an unsafe path: ${root}`
    );
  }

  const marker = readMarker(resolvedRoot);
  if (expectedNonce !== undefined && marker.nonce !== expectedNonce) {
    throw new TestHarnessConfigurationError(
      `Relay test harness ownership nonce does not match: ${root}`
    );
  }
  return marker;
}

export function createHarnessRoot(): { root: string; nonce: string } {
  const root = mkdtempSync(join(realpathSync(tmpdir()), HARNESS_PREFIX));
  const nonce = randomUUID();
  writeFileSync(
    join(root, MARKER_FILE),
    `${JSON.stringify({ schema: MARKER_SCHEMA, nonce }, null, 2)}\n`,
    { flag: "wx", mode: 0o600 }
  );
  assertHarnessOwnedRoot(root, nonce);
  return { root, nonce };
}

export function createWorkerDataDir(root: string, workerId: string): string {
  assertHarnessOwnedRoot(root);
  const safeWorkerId = workerId.replace(/[^A-Za-z0-9._-]/g, "_");
  if (!safeWorkerId) {
    throw new TestHarnessConfigurationError(
      "Relay test worker id must contain at least one safe path character"
    );
  }
  const workerRoot = resolve(root, `worker-${safeWorkerId}`);
  if (!isWithin(resolve(root), workerRoot)) {
    throw new TestHarnessConfigurationError(
      `Relay test worker directory escaped its harness root: ${workerRoot}`
    );
  }
  mkdirSync(workerRoot, { recursive: true });
  return workerRoot;
}

export function removeHarnessRoot(root: string, nonce: string): void {
  assertHarnessOwnedRoot(root, nonce);
  rmSync(root, { recursive: true, force: false, maxRetries: 3, retryDelay: 100 });
}
