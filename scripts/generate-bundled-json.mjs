// Regenerate src/lib/packs/bundled.json from src/lib/packs/bundled.ts.
//
// WHY this exists: the R4 tarball size gate (scripts/check-pack-tarball.mjs)
// runs under plain `node` at publish time (via scripts/npx-prod-smoke.mjs) and
// CANNOT import the `.ts` source. So the typed, human-authored `bundled.ts`
// (the BUNDLED_PACK_IDS allowlist + the size budget) is mirrored into a
// checked-in `bundled.json` the gate reads. This script keeps them in lockstep
// — edit `bundled.ts`, then run:
//
//   node scripts/generate-bundled-json.mjs
//
// `bundled.test.ts` fails loudly if the committed JSON ever drifts from the TS,
// so a forgotten regeneration is caught in CI, not at a customer's install.
//
// Uses Node's --experimental-strip-types to load the TS module (the repo has no
// tsx/ts-node). bundled.ts is a zero-import leaf, so type-stripping alone is
// sufficient — no transpilation of TS-only constructs needed.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsPath = path.join(repoRoot, "src", "lib", "packs", "bundled.ts");
const jsonPath = path.join(repoRoot, "src", "lib", "packs", "bundled.json");

const child = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "-e",
    `import(${JSON.stringify(tsPath)}).then(m => process.stdout.write(JSON.stringify({` +
      `bundledPackIds: m.BUNDLED_PACK_IDS, sizeBudgetKb: m.BUNDLED_TEMPLATES_SIZE_BUDGET_KB` +
      `}))).catch(e => { console.error(e.message); process.exit(1); });`,
  ],
  { encoding: "utf-8" },
);

if (child.status !== 0) {
  console.error("[bundled-json] failed to load bundled.ts:");
  console.error(child.stderr || child.stdout);
  process.exit(1);
}

const data = JSON.parse(child.stdout);
writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n");
console.log(
  `[bundled-json] wrote ${path.relative(repoRoot, jsonPath)} — ` +
    `${data.bundledPackIds.length} bundled packs, budget ${data.sizeBudgetKb} KB.`,
);
