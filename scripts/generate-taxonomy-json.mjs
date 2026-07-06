// Regenerate src/lib/packs/taxonomy.json from src/lib/packs/taxonomy.ts.
//
// WHY this exists: the R3 build gate (scripts/check-pack-taxonomy.mjs) runs
// under plain `node` at publish time (via scripts/npx-prod-smoke.mjs) and
// CANNOT import the `.ts` source. So the typed, human-authored `taxonomy.ts`
// is mirrored into a checked-in `taxonomy.json` the gate reads. This script
// keeps them in lockstep — edit `taxonomy.ts`, then run:
//
//   node scripts/generate-taxonomy-json.mjs
//
// `taxonomy.test.ts` fails loudly if the committed JSON ever drifts from the
// TS, so a forgotten regeneration is caught in CI, not at a customer's install.
//
// Uses Node's --experimental-strip-types to load the TS module (the repo has no
// tsx/ts-node). taxonomy.ts imports only `zod` (a real runtime dependency), so
// type-stripping is sufficient — no transpilation of TS-only constructs needed.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsPath = path.join(repoRoot, "src", "lib", "packs", "taxonomy.ts");
const jsonPath = path.join(repoRoot, "src", "lib", "packs", "taxonomy.json");

// Extract TAXONOMY in a child `node --experimental-strip-types` process so this
// wrapper stays runnable on nodes that need the flag, without polluting the
// parent's flags.
const child = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "-e",
    `import(${JSON.stringify(tsPath)}).then(m => process.stdout.write(JSON.stringify(m.TAXONOMY)))` +
      `.catch(e => { console.error(e.message); process.exit(1); });`,
  ],
  { encoding: "utf-8" },
);

if (child.status !== 0) {
  console.error("[taxonomy-json] failed to load taxonomy.ts:");
  console.error(child.stderr || child.stdout);
  process.exit(1);
}

const taxonomy = JSON.parse(child.stdout);
writeFileSync(jsonPath, JSON.stringify(taxonomy, null, 2) + "\n");
console.log(
  `[taxonomy-json] wrote ${path.relative(repoRoot, jsonPath)} — ` +
    `${Object.keys(taxonomy.tables).length} tables, ${Object.keys(taxonomy.schedules).length} schedules.`,
);
