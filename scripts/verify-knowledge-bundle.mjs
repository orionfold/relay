#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyKnowledgeBundle } from "./lib/knowledge-bundle.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const args = {
    bundleDir: path.join(repoRoot, "knowledge"),
    packageJsonPath: path.join(repoRoot, "package.json"),
  };
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--bundle") args.bundleDir = path.resolve(argv[++index]);
    else if (value === "--package-json") args.packageJsonPath = path.resolve(argv[++index]);
    else if (value === "--help" || value === "-h") {
      console.log("Usage: node scripts/verify-knowledge-bundle.mjs [--bundle <dir>] [--package-json <file>]");
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
}

try {
  const result = verifyKnowledgeBundle(parseArgs(process.argv));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
}
