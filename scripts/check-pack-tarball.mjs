// Publish-gate pack-tarball size + allowlist check (R4, features/pack-tarball-diet.md).
//
// The tarball-diet measurement showed the bundled packs are cheap TODAY (206 KB
// across 9 packs), so nothing is cut yet — every pack still ships bundled. This
// gate keeps that decision honest as the catalog grows, on two axes:
//
//   (i)  ALLOWLIST DRIFT — the packs physically present under templates/ must
//        exactly equal the declared BUNDLED_PACK_IDS (mirrored to bundled.json).
//        A pack on disk but not declared would ship silently; one declared but
//        missing would 404 under npx. Either is drift (the files-allowlist trap,
//        memory logo-3d-swap-recipe). Fails CLOSED — a mismatch is a real error.
//   (ii) SIZE BUDGET — total unpacked size of templates/ must stay under
//        bundled.json sizeBudgetKb. Crossing it means the diet now pays for its
//        complexity: the gate FAILS to force the cut decision (edit
//        BUNDLED_PACK_IDS + move the long tail to fetch-on-install) rather than
//        letting the tarball quietly bloat toward the "hundreds of packs" limit
//        Pillar F named. This is the deferral trigger that makes "don't cut yet"
//        an auditable choice, not a forgotten one.
//
// Modeled on scripts/check-pack-taxonomy.mjs (standalone .mjs, TEMPLATES_DIR
// walk, exported testable core, process.exit(1) on drift, npm alias). Purely
// LOCAL (no network) so it fails CLOSED — a broken local input is a real error.
//
// Usage:
//   node scripts/check-pack-tarball.mjs      # exits 0 clean, 1 on drift/overflow
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Root dir holding one subdir per bundled pack template. */
export const TEMPLATES_DIR = path.join("src", "lib", "packs", "templates");

/** The bundled-pack SSOT, checked in as JSON (generated from bundled.ts). */
const BUNDLED_JSON = path.join("src", "lib", "packs", "bundled.json");

/** Recursively sum the byte size of every file under `dir`. */
export function dirSizeBytes(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSizeBytes(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

/**
 * Pure check core (unit-testable). Reads the declared allowlist + budget and the
 * physical templates/ tree, and returns `{ findings, declared, present, ... }`.
 * `opts.templatesDir` / `opts.bundledJsonPath` override the roots for tests.
 */
export function runCheck(opts = {}) {
  const templatesDir = opts.templatesDir ?? path.join(repoRoot, TEMPLATES_DIR);
  const bundledJsonPath = opts.bundledJsonPath ?? path.join(repoRoot, BUNDLED_JSON);

  const { bundledPackIds, sizeBudgetKb } = JSON.parse(
    readFileSync(bundledJsonPath, "utf-8"),
  );
  const declared = [...bundledPackIds].sort();

  const present = readdirSync(templatesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const findings = [];

  // (i) ALLOWLIST DRIFT — the declared set must equal what is on disk.
  const declaredSet = new Set(declared);
  const presentSet = new Set(present);
  for (const id of present) {
    if (!declaredSet.has(id)) {
      findings.push(
        `undeclared: "${id}" ships in ${TEMPLATES_DIR}/ but is not in BUNDLED_PACK_IDS ` +
          `— add it to bundled.ts (then regenerate bundled.json) or remove the template.`,
      );
    }
  }
  for (const id of declared) {
    if (!presentSet.has(id)) {
      findings.push(
        `missing: "${id}" is declared in BUNDLED_PACK_IDS but has no template dir under ` +
          `${TEMPLATES_DIR}/ — it would 404 under npx. Restore it or remove it from bundled.ts.`,
      );
    }
  }

  // (ii) SIZE BUDGET — total unpacked templates size vs. the deferral trigger.
  const totalBytes = dirSizeBytes(templatesDir);
  const totalKb = totalBytes / 1024;
  const budgetKb = Number(sizeBudgetKb);
  const overBudget = totalKb > budgetKb;
  if (overBudget) {
    findings.push(
      `size budget exceeded: templates/ is ${totalKb.toFixed(1)} KB unpacked, over the ` +
        `${budgetKb} KB budget. The tarball diet now pays for itself — either perform the cut ` +
        `(slim BUNDLED_PACK_IDS + move the long tail to fetch-on-install, features/pack-tarball-diet.md) ` +
        `or deliberately raise BUNDLED_TEMPLATES_SIZE_BUDGET_KB in bundled.ts with rationale.`,
    );
  }

  return { findings, declared, present, totalKb, budgetKb, overBudget };
}

function mainCli() {
  let result;
  try {
    result = runCheck();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pack-tarball] ERROR — could not run the check: ${msg}`);
    process.exit(1);
  }

  if (result.findings.length === 0) {
    console.log(
      `[pack-tarball] OK — ${result.present.length} bundled packs, ` +
        `${result.totalKb.toFixed(1)} KB unpacked / ${result.budgetKb} KB budget, ` +
        `allowlist matches templates/.`,
    );
    return;
  }
  console.error(`[pack-tarball] DRIFT — bundled-pack allowlist or size budget violated:`);
  for (const f of result.findings) console.error(`  - ${f}`);
  process.exitCode = 1;
}

// Run only when invoked directly, never on import (so the pure exports stay
// unit-testable without side effects) — same guard as check-pack-taxonomy.mjs.
if (import.meta.url === pathToFileURLSafe(process.argv[1])) {
  mainCli();
}

/** process.argv[1] → file URL, tolerant of it being undefined (e.g. in tests). */
function pathToFileURLSafe(p) {
  if (!p) return "";
  try {
    return new URL(`file://${path.resolve(p)}`).href;
  } catch {
    return "";
  }
}
