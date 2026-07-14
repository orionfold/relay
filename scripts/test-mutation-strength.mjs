#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  BASELINE_TEST_FILES,
  MUTATION_STRENGTH_MANIFEST,
} from "./mutation-strength-manifest.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const nonce = randomUUID();
const projectRoot = join(
  repoRoot,
  `.mutation-strength-${process.pid}-${nonce.slice(0, 8)}`
);
const markerPath = join(projectRoot, ".relay-mutation-strength.json");
const homeDir = join(projectRoot, ".home");
const appDataDir = join(homeDir, "AppData", "Roaming");
const localAppDataDir = join(homeDir, "AppData", "Local");
const xdgConfigDir = join(homeDir, ".config");
const xdgCacheDir = join(homeDir, ".cache");
const tempDir = join(projectRoot, ".tmp");
const vitestBin = join(repoRoot, "node_modules", "vitest", "vitest.mjs");
const MAX_RUN_MS = 45_000;

class MutationStrengthHarnessError extends Error {
  constructor(message) {
    super(message);
    this.name = "MutationStrengthHarnessError";
  }
}

function countOccurrences(source, needle) {
  if (!needle) return 0;
  return source.split(needle).length - 1;
}

function safeRunId(label) {
  return label.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);
}

function childEnvironment(runId) {
  const environment = {};
  for (const key of [
    "PATH",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "SystemRoot",
    "WINDIR",
    "ComSpec",
    "PATHEXT",
  ]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return {
    ...environment,
    HOME: homeDir,
    USERPROFILE: homeDir,
    APPDATA: appDataDir,
    LOCALAPPDATA: localAppDataDir,
    XDG_CONFIG_HOME: xdgConfigDir,
    XDG_CACHE_HOME: xdgCacheDir,
    TMPDIR: tempDir,
    TMP: tempDir,
    TEMP: tempDir,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    NEXT_TELEMETRY_DISABLED: "1",
    RELAY_DEV_MODE: "true",
    RELAY_MUTATION_RUN_ID: safeRunId(runId),
  };
}

function stripAnsi(output) {
  return output.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    ""
  );
}

function parseGreenCounts(output) {
  const plainOutput = stripAnsi(output);
  const files = plainOutput.match(/Test Files\s+(\d+) passed/);
  const tests = plainOutput.match(/Tests\s+(\d+) passed/);
  return {
    files: files ? Number(files[1]) : null,
    tests: tests ? Number(tests[1]) : null,
  };
}

function outputTail(output, lines = 80) {
  return output.split("\n").slice(-lines).join("\n");
}

function hasNamedFailure(output, evidence) {
  return output
    .split("\n")
    .some((line) => line.includes("FAIL") && line.includes(evidence));
}

function runVitest(label, testArgs) {
  const startedAt = performance.now();
  const result = spawnSync(
    process.execPath,
    [
      vitestBin,
      "run",
      "--config",
      "vitest.config.ts",
      "--reporter=verbose",
      ...testArgs,
    ],
    {
      cwd: projectRoot,
      env: childEnvironment(label),
      encoding: "utf8",
      timeout: MAX_RUN_MS,
      maxBuffer: 4 * 1024 * 1024,
    }
  );
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return {
    label,
    status: result.status,
    signal: result.signal,
    spawnError: result.error?.message ?? null,
    durationMs: Math.round(performance.now() - startedAt),
    counts: parseGreenCounts(output),
    output,
    plainOutput: stripAnsi(output),
  };
}

function assertGreen(run, expectedFiles) {
  if (
    run.status !== 0 ||
    run.signal ||
    run.spawnError ||
    run.counts.files !== expectedFiles ||
    !run.counts.tests ||
    run.counts.tests < 1
  ) {
    throw new MutationStrengthHarnessError(
      `${run.label} did not produce the expected green ${expectedFiles}-file matrix\n${outputTail(run.plainOutput)}`
    );
  }
}

function classifyMutation(mutant, run) {
  if (
    run.signal ||
    run.spawnError ||
    run.status == null ||
    /No test files found|Unhandled Error|EnvironmentTeardownError/.test(
      run.plainOutput
    )
  ) {
    return "harness-error";
  }
  if (run.status === 0) {
    return run.counts.tests && run.counts.tests > 0
      ? "survived"
      : "harness-error";
  }
  if (
    run.status === 1 &&
    mutant.failureEvidence &&
    hasNamedFailure(run.plainOutput, mutant.failureEvidence)
  ) {
    return "killed";
  }
  return "harness-error";
}

function validateManifest() {
  const ids = new Set();
  for (const mutant of MUTATION_STRENGTH_MANIFEST) {
    if (ids.has(mutant.id)) {
      throw new MutationStrengthHarnessError(
        `Duplicate mutation id: ${mutant.id}`
      );
    }
    ids.add(mutant.id);
    if (!BASELINE_TEST_FILES.includes(mutant.testArgs[0])) {
      throw new MutationStrengthHarnessError(
        `${mutant.id} targets a test outside the bounded baseline matrix`
      );
    }
    if (!['killed', 'survived'].includes(mutant.expectedOutcome)) {
      throw new MutationStrengthHarnessError(
        `${mutant.id} has invalid expected outcome ${mutant.expectedOutcome}`
      );
    }
    if (mutant.expectedOutcome === "killed" && !mutant.failureEvidence) {
      throw new MutationStrengthHarnessError(
        `${mutant.id} must name expected failure evidence`
      );
    }
    if (mutant.expectedOutcome === "survived" && !mutant.reviewDisposition) {
      throw new MutationStrengthHarnessError(
        `${mutant.id} must carry a survivor review disposition`
      );
    }
  }
  const killed = MUTATION_STRENGTH_MANIFEST.filter(
    (mutant) => mutant.expectedOutcome === "killed"
  );
  const controls = MUTATION_STRENGTH_MANIFEST.filter(
    (mutant) => mutant.expectedOutcome === "survived" && mutant.control
  );
  if (killed.length !== 7 || controls.length !== 1) {
    throw new MutationStrengthHarnessError(
      `Expected seven killed mutants and one survivor control; found ${killed.length} and ${controls.length}`
    );
  }
}

function prepareProject() {
  validateManifest();
  mkdirSync(projectRoot);
  writeFileSync(
    markerPath,
    JSON.stringify({ schema: 1, nonce, owner: "relay-mutation-strength" })
  );
  for (const directory of [
    appDataDir,
    localAppDataDir,
    xdgConfigDir,
    xdgCacheDir,
    tempDir,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  cpSync(join(repoRoot, "src"), join(projectRoot, "src"), {
    recursive: true,
  });
  for (const file of ["package.json", "tsconfig.json", "next-env.d.ts"]) {
    copyFileSync(join(repoRoot, file), join(projectRoot, file));
  }
  const configSource = readFileSync(join(repoRoot, "vitest.config.ts"), "utf8");
  const configAnchor = "export default defineConfig({";
  if (countOccurrences(configSource, configAnchor) !== 1) {
    throw new MutationStrengthHarnessError(
      "Vitest config cacheDir injection anchor is missing or ambiguous"
    );
  }
  writeFileSync(
    join(projectRoot, "vitest.config.ts"),
    configSource.replace(
      configAnchor,
      `${configAnchor}\n  cacheDir: path.resolve(__dirname, ".mutation-cache", process.env.RELAY_MUTATION_RUN_ID ?? "default"),`
    )
  );
  symlinkSync(
    join(repoRoot, "node_modules"),
    join(projectRoot, "node_modules"),
    process.platform === "win32" ? "junction" : "dir"
  );

  for (const testFile of BASELINE_TEST_FILES) {
    if (!existsSync(join(projectRoot, testFile))) {
      throw new MutationStrengthHarnessError(
        `Baseline test file is missing: ${testFile}`
      );
    }
  }
  for (const mutant of MUTATION_STRENGTH_MANIFEST) {
    const mutationPath = join(projectRoot, mutant.file);
    const fileType = lstatSync(mutationPath);
    if (!fileType.isFile() || fileType.isSymbolicLink()) {
      throw new MutationStrengthHarnessError(
        `${mutant.id} refuses non-regular mutation target ${mutant.file}`
      );
    }
    const source = readFileSync(mutationPath, "utf8");
    const matches = countOccurrences(source, mutant.find);
    if (matches !== 1) {
      throw new MutationStrengthHarnessError(
        `${mutant.id} expected one source anchor in ${mutant.file}; found ${matches}`
      );
    }
  }
}

process.once("exit", () => {
  if (!existsSync(projectRoot)) return;
  try {
    cleanupProject();
  } catch (error) {
    process.exitCode = 1;
    console.error(
      `[mutation-strength] exit cleanup failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
});

function cleanupProject() {
  if (!existsSync(projectRoot)) return true;
  if (
    dirname(projectRoot) !== repoRoot ||
    !basename(projectRoot).startsWith(".mutation-strength-") ||
    lstatSync(projectRoot).isSymbolicLink() ||
    !lstatSync(projectRoot).isDirectory()
  ) {
    throw new MutationStrengthHarnessError(
      `Refusing to clean unsafe mutation path: ${projectRoot}`
    );
  }
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  if (
    marker.schema !== 1 ||
    marker.nonce !== nonce ||
    marker.owner !== "relay-mutation-strength"
  ) {
    throw new MutationStrengthHarnessError(
      `Refusing to clean mutation path with invalid ownership marker: ${projectRoot}`
    );
  }
  rmSync(projectRoot, { recursive: true, force: true });
  return !existsSync(projectRoot);
}

const totalStartedAt = performance.now();
let report = {
  schemaVersion: 1,
  ok: false,
  baseline: null,
  mutants: [],
  restoration: null,
  summary: null,
  cleanup: { removed: false },
};
let failure = null;

try {
  prepareProject();
  const baseline = runVitest("baseline", BASELINE_TEST_FILES);
  assertGreen(baseline, BASELINE_TEST_FILES.length);
  report.baseline = {
    files: baseline.counts.files,
    tests: baseline.counts.tests,
    durationMs: baseline.durationMs,
  };

  for (const mutant of MUTATION_STRENGTH_MANIFEST) {
    const filePath = join(projectRoot, mutant.file);
    const original = readFileSync(filePath, "utf8");
    let run;
    try {
      writeFileSync(filePath, original.replace(mutant.find, mutant.replace));
      run = runVitest(mutant.id, mutant.testArgs);
    } finally {
      writeFileSync(filePath, original);
    }
    if (readFileSync(filePath, "utf8") !== original) {
      throw new MutationStrengthHarnessError(
        `${mutant.id} did not restore ${mutant.file} byte-for-byte`
      );
    }
    const actualOutcome = classifyMutation(mutant, run);
    report.mutants.push({
      id: mutant.id,
      surface: mutant.surface,
      expectedOutcome: mutant.expectedOutcome,
      actualOutcome,
      expectationMet: actualOutcome === mutant.expectedOutcome,
      durationMs: run.durationMs,
      testFile: mutant.testArgs[0],
      testFilter:
        mutant.testArgs[1] === "-t" ? mutant.testArgs[2] : null,
      failureEvidenceMatched:
        mutant.expectedOutcome === "killed"
          ? hasNamedFailure(run.plainOutput, mutant.failureEvidence)
          : null,
      reviewDisposition: mutant.reviewDisposition ?? null,
      harnessTail:
        actualOutcome === "harness-error" ? outputTail(run.plainOutput) : null,
    });
  }

  const restoration = runVitest("restoration", BASELINE_TEST_FILES);
  assertGreen(restoration, BASELINE_TEST_FILES.length);
  if (
    restoration.counts.files !== baseline.counts.files ||
    restoration.counts.tests !== baseline.counts.tests
  ) {
    throw new MutationStrengthHarnessError(
      `Restoration matrix drifted from ${baseline.counts.files}/${baseline.counts.tests} to ${restoration.counts.files}/${restoration.counts.tests}`
    );
  }
  report.restoration = {
    files: restoration.counts.files,
    tests: restoration.counts.tests,
    durationMs: restoration.durationMs,
    matchesBaseline: true,
  };

  const killed = report.mutants.filter(
    (mutant) => mutant.actualOutcome === "killed"
  ).length;
  const survived = report.mutants.filter(
    (mutant) => mutant.actualOutcome === "survived"
  ).length;
  const expectationFailures = report.mutants.filter(
    (mutant) => !mutant.expectationMet
  );
  report.summary = {
    requiredMutants: 7,
    killed,
    killRatePct: Math.round((killed / 7) * 10_000) / 100,
    survivorControls: survived,
    expectationFailures: expectationFailures.map((mutant) => mutant.id),
    totalDurationMs: Math.round(performance.now() - totalStartedAt),
  };
  if (
    expectationFailures.length > 0 ||
    killed !== 7 ||
    survived !== 1
  ) {
    throw new MutationStrengthHarnessError(
      `Mutation expectations failed: killed=${killed}, survived=${survived}, mismatches=${expectationFailures
        .map((mutant) => mutant.id)
        .join(", ") || "none"}`
    );
  }
  report.ok = true;
} catch (error) {
  failure = error;
} finally {
  try {
    report.cleanup.removed = cleanupProject();
  } catch (error) {
    failure ??= error;
    report.cleanup.error = error instanceof Error ? error.message : String(error);
  }
}

if (failure) {
  console.error(JSON.stringify(report, null, 2));
  console.error(
    failure instanceof Error ? `${failure.name}: ${failure.message}` : failure
  );
  process.exitCode = 1;
} else {
  console.log(JSON.stringify(report, null, 2));
}
