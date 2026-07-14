#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixtureRoot = mkdtempSync(join(tmpdir(), "relay-harness-sentinel-"));
const inheritedDataDir = join(fixtureRoot, "customer-data");
const sentinelPath = join(inheritedDataDir, "relay.db");

function digest(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function snapshot(directory) {
  return readdirSync(directory)
    .sort()
    .map((name) => {
      const path = join(directory, name);
      const stat = statSync(path);
      return { name, size: stat.size, sha256: stat.isFile() ? digest(path) : null };
    });
}

try {
  mkdirSync(inheritedDataDir);
  writeFileSync(sentinelPath, "operator-owned database sentinel\n", {
    flag: "wx",
  });
  const before = snapshot(inheritedDataDir);

  const result = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "src/test/__tests__/harness.test.ts",
      "src/lib/schedules/__tests__/slot-claim.test.ts",
      "--config",
      "vitest.config.ts",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        RELAY_DATA_DIR: inheritedDataDir,
        RELAY_TEST_REPORT_HARNESS_ROOT: "1",
      },
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Harness safety child suite exited ${result.status}`);
  }

  const after = snapshot(inheritedDataDir);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    throw new Error(
      `Inherited RELAY_DATA_DIR changed:\nbefore=${JSON.stringify(before)}\nafter=${JSON.stringify(after)}`
    );
  }

  const rootMatch = result.stdout.match(
    /\[relay-test-harness\] root=("(?:[^"\\]|\\.)*")/
  );
  if (!rootMatch) {
    throw new Error("Child suite did not report its harness-owned root");
  }
  const harnessRoot = JSON.parse(rootMatch[1]);
  if (existsSync(harnessRoot)) {
    throw new Error(`Harness teardown left its owned root behind: ${harnessRoot}`);
  }
  if (!result.stdout.includes(`[relay-test-harness] removed=${JSON.stringify(harnessRoot)} exists=false`)) {
    throw new Error("Child suite did not confirm bounded harness cleanup");
  }

  console.log(
    `Harness safety verified: inherited sentinel unchanged; owned root removed (${before[0].sha256}).`
  );
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
