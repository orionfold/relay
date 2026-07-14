#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyTestFile } from "./test-projects.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const vitest = resolve(repoRoot, "node_modules/vitest/vitest.mjs");

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      if (entry.isSymbolicLink()) return [];
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
}

const expected = walk(resolve(repoRoot, "src"))
  .map((path) => relative(repoRoot, path).replaceAll("\\", "/"))
  .filter((path) => {
    const project = classifyTestFile(path);
    return project && project !== "e2e";
  })
  .sort();

const listed = spawnSync(process.execPath, [vitest, "list", "--filesOnly"], {
  cwd: repoRoot,
  env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

if (listed.error || listed.signal || listed.status !== 0) {
  const reason = listed.error?.message ?? listed.signal ?? `exit ${listed.status}`;
  throw new Error(
    `Vitest project enumeration failed (${reason})\n${listed.stdout ?? ""}${listed.stderr ?? ""}`
  );
}

const actual = `${listed.stdout ?? ""}\n${listed.stderr ?? ""}`
  .split("\n")
  .map((line) => line.trim().replaceAll("\\", "/"))
  .map((line) => line.replace(/^\[[^\]]+\]\s+/, ""))
  .filter((line) => line.startsWith("src/") && /\.test\.(?:ts|tsx)$/.test(line));

const actualCounts = new Map();
for (const path of actual) actualCounts.set(path, (actualCounts.get(path) ?? 0) + 1);

const missing = expected.filter((path) => !actualCounts.has(path));
const unexpected = [...actualCounts.keys()].filter((path) => !expected.includes(path));
const duplicate = [...actualCounts.entries()]
  .filter(([, count]) => count !== 1)
  .map(([path, count]) => `${path} (${count} projects)`);

if (missing.length || unexpected.length || duplicate.length) {
  throw new Error(
    [
      "Vitest project membership is not one-to-one.",
      missing.length ? `Missing: ${missing.join(", ")}` : null,
      unexpected.length ? `Unexpected: ${unexpected.join(", ")}` : null,
      duplicate.length ? `Duplicate: ${duplicate.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("\n")
  );
}

const counts = expected.reduce(
  (result, path) => {
    result[classifyTestFile(path)] += 1;
    return result;
  },
  { node: 0, jsdom: 0, browser: 0 }
);

console.log(
  `[test-projects] OK node=${counts.node} jsdom=${counts.jsdom} browser=${counts.browser} total=${expected.length}`
);
