#!/usr/bin/env node

import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url)));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
const baseline = JSON.parse(
  readFileSync(new URL("../config/install-dependency-debt.json", import.meta.url)),
);
const nextConfig = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");

if (pkg.dependencies?.exceljs || lock.packages["node_modules/exceljs"]) {
  console.error("STALE_SPREADSHEET_DEPENDENCY_REINTRODUCED exceljs");
  process.exit(1);
}
for (const [name, expected] of Object.entries(
  baseline.spreadsheetDependencies ?? {},
)) {
  const declared = pkg.dependencies?.[name];
  const locked = lock.packages[`node_modules/${name}`]?.version;
  if (declared !== expected.declared || locked !== expected.locked) {
    console.error(`SPREADSHEET_DEPENDENCY_CONTRACT_CHANGED ${name}`);
    console.error(
      `expected=${JSON.stringify(expected)} actual=${JSON.stringify({ declared, locked })}`,
    );
    process.exit(1);
  }
}
for (const [name, expected] of Object.entries(
  baseline.explicitRuntimePeers ?? {},
)) {
  const declared = pkg.dependencies?.[name];
  const locked = lock.packages[`node_modules/${name}`]?.version;
  if (declared !== expected.declared || locked !== expected.locked) {
    console.error(`EXPLICIT_RUNTIME_PEER_CONTRACT_CHANGED ${name}`);
    console.error(
      `expected=${JSON.stringify(expected)} actual=${JSON.stringify({ declared, locked })}`,
    );
    process.exit(1);
  }
}

const expected = baseline.deprecatedPackages
  .map(({ name, version }) => ({ name, version }))
  .sort((a, b) => a.name.localeCompare(b.name));
const actual = expected
  .map(({ name }) => ({
    name,
    version: lock.packages[`node_modules/${name}`]?.version,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  console.error("INSTALL_DEPENDENCY_DEBT_CHANGED");
  console.error(`expected=${JSON.stringify(expected)}`);
  console.error(`actual=${JSON.stringify(actual)}`);
  process.exit(1);
}

const unexpectedRecordedDeprecations = Object.entries(lock.packages)
  .filter(([, entry]) => typeof entry.deprecated === "string")
  .map(([path, entry]) => ({
    name: path.replace(/^node_modules\//, ""),
    version: entry.version,
  }))
  .filter(
    (entry) =>
      !expected.some(
        (accepted) =>
          accepted.name === entry.name && accepted.version === entry.version,
      ),
  );
if (unexpectedRecordedDeprecations.length > 0) {
  console.error(
    `INSTALL_DEPENDENCY_DEBT_GREW ${JSON.stringify(unexpectedRecordedDeprecations)}`,
  );
  process.exit(1);
}

if (pkg.dependencies?.["pdfjs-dist"] || pkg.devDependencies?.["pdfjs-dist"]) {
  console.error("PDFJS_DIRECT_DEPENDENCY_UNEXPECTED pdfjs-dist must remain owned by pdf-parse");
  process.exit(1);
}
const pdfParse = lock.packages["node_modules/pdf-parse"];
if (!pdfParse?.dependencies?.["pdfjs-dist"]) {
  console.error("PDFJS_TRANSITIVE_OWNER_MISSING pdf-parse no longer declares pdfjs-dist");
  process.exit(1);
}
for (const external of ["better-sqlite3", "pdf-parse", "pdfjs-dist"]) {
  if (!nextConfig.includes(`\"${external}\"`)) {
    console.error(`NEXT_EXTERNALIZATION_MISSING ${external}`);
    process.exit(1);
  }
}

console.log(
  `install dependency debt verified: ${actual.length} attributed deprecated transitives; spreadsheet replacements, runtime peers, and pdfjs-dist externalization are exact`,
);
