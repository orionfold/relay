// Publish-gate pack-taxonomy check (R3, features/pack-taxonomy-ci-gate.md).
//
// The owned-primitive registry — which pack owns which logical table/schedule
// id, with which column contract — is codified in src/lib/packs/taxonomy.ts
// (R1) and mirrored to src/lib/packs/taxonomy.json (kept in lockstep by
// taxonomy.test.ts). This gate reads the JSON (it runs under plain `node` at
// publish time, so it cannot import the .ts), walks every bundled pack
// manifest, and FAILS THE BUILD on three ownership-drift classes:
//
//   (i)   second owner    — a pack DECLARES an owned id with DIFFERENT columns
//                           than the registered owner (a divergent re-definition,
//                           not the legal spine re-list). This is the exact bug
//                           the relay-agency-cre bundle surfaced.
//   (ii)  unregistered    — a pack declares a logical id absent from taxonomy.
//   (iii) column drift    — the REGISTERED OWNER declares its own table with a
//                           column set that differs from the registry contract.
//
// A NON-owner that declares an owned id with the EXACT registered columns is the
// legal Pro→spine re-list pattern (relay-agency-pro re-lists engagements/intake
// verbatim because it installs standalone and needs the table in its own app
// scope) — that PASSES. Only a divergent re-definition fails.
//
// Modeled on scripts/check-price-drift.mjs (standalone .mjs, TEMPLATES_DIR walk,
// js-yaml parse, exported testable core, process.exit(1) on drift, npm alias).
// Unlike price-drift this is a purely LOCAL check (no network) so it fails
// CLOSED — a broken local input is a real error, never a fail-open skip.
//
// Usage:
//   node scripts/check-pack-taxonomy.mjs     # exits 0 clean, 1 on any drift
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Root dir holding one subdir per bundled pack template. */
export const TEMPLATES_DIR = path.join("src", "lib", "packs", "templates");

/** The codified registry, checked in as JSON (generated from taxonomy.ts). */
export const TAXONOMY_JSON = path.join("src", "lib", "packs", "taxonomy.json");

// ── I/O boundaries ───────────────────────────────────────────────────

/** Load the codified taxonomy JSON. Throws loudly if missing/malformed — it is
 * OUR generated artifact, so a broken one is a real error, not a fail-open. */
export function loadTaxonomyJson(root = repoRoot) {
  const raw = readFileSync(path.join(root, TAXONOMY_JSON), "utf-8");
  return JSON.parse(raw);
}

/**
 * Collect every bundled pack's DECLARED logical table + schedule ids from its
 * base/manifest.yaml. Returns `[{ id, tables: [{id, columns}], schedules: [id] }]`
 * for packs that HAVE a base/manifest.yaml; bundle packs (relay-agency-cre,
 * relay-agency-nonprofit, relay-marketing) have none — a `bundle:` child list
 * lives only in pack.yaml — and are SKIPPED without error.
 *
 * Only entries under `tables:` (each with its own `columns:`) count as a
 * DECLARE. A logical id merely REFERENCED by a trigger/KPI/blueprint never
 * appears under `tables:`, so the manifest walk naturally excludes references —
 * a reference to an owned id is legal (the Pro→spine pattern) and is not checked.
 */
export function declaredPrimitives(root = repoRoot) {
  const dir = path.join(root, TEMPLATES_DIR);
  const packIds = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const out = [];
  for (const id of packIds) {
    const manifestPath = path.join(dir, id, "base", "manifest.yaml");
    let raw;
    try {
      raw = readFileSync(manifestPath, "utf-8");
    } catch {
      continue; // bundle pack (no base/manifest.yaml) — expected, skip.
    }
    const manifest = yaml.load(raw);
    const tables = Array.isArray(manifest?.tables)
      ? manifest.tables
          .filter((t) => t && typeof t.id === "string")
          .map((t) => ({
            id: t.id,
            columns: Array.isArray(t.columns) ? [...t.columns] : [],
          }))
      : [];
    const schedules = Array.isArray(manifest?.schedules)
      ? manifest.schedules
          .filter((s) => s && typeof s.id === "string")
          .map((s) => s.id)
      : [];
    out.push({ id, tables, schedules });
  }
  return out;
}

// ── the pure check ───────────────────────────────────────────────────

/** Order-insensitive column-set equality. */
function sameColumns(a, b) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((c, i) => c === sb[i]);
}

/** Human-readable diff of two column sets (added/removed vs the registry). */
function columnDiff(declared, registered) {
  const added = declared.filter((c) => !registered.includes(c));
  const removed = registered.filter((c) => !declared.includes(c));
  const parts = [];
  if (added.length) parts.push(`added [${added.join(", ")}]`);
  if (removed.length) parts.push(`missing [${removed.join(", ")}]`);
  return parts.join(", ") || "reordered";
}

/**
 * Pure reconciliation of every declared primitive against the taxonomy. Returns
 * an array of finding strings (empty ⇒ clean). No I/O — inputs are already
 * parsed, so this is the unit-tested source of truth for the three drift rules.
 *
 * @param packs     output of declaredPrimitives()
 * @param taxonomy  output of loadTaxonomyJson()
 */
export function checkTaxonomy(packs, taxonomy) {
  const findings = [];
  const tables = taxonomy?.tables ?? {};
  const schedules = taxonomy?.schedules ?? {};

  for (const pack of packs) {
    for (const t of pack.tables) {
      const reg = tables[t.id];
      if (!reg) {
        // (ii) unregistered owner
        findings.push(
          `unregistered table "${t.id}" declared by "${pack.id}" — add it to ` +
            `src/lib/packs/taxonomy.ts with "${pack.id}" as owner (columns ` +
            `[${t.columns.join(", ")}]), then regenerate taxonomy.json.`,
        );
        continue;
      }
      const columnsMatch = sameColumns(t.columns, reg.columns);
      if (pack.id === reg.owner) {
        // Registered owner's own declaration — columns must match the contract.
        if (!columnsMatch) {
          // (iii) column-contract drift
          findings.push(
            `column drift: owner "${pack.id}" declares table "${t.id}" with ` +
              `${columnDiff(t.columns, reg.columns)} vs the registered contract ` +
              `[${reg.columns.join(", ")}] — reconcile taxonomy.ts + the manifest.`,
          );
        }
        continue;
      }
      // A non-owner declared an owned id.
      if (columnsMatch) {
        // Legal re-list (Pro→spine pattern): identical columns, shared table.
        continue;
      }
      // (i) second owner — a divergent re-definition of another pack's table.
      findings.push(
        `second owner: table "${t.id}" is owned by "${reg.owner}" but "${pack.id}" ` +
          `declares it with ${columnDiff(t.columns, reg.columns)} vs the registered ` +
          `contract [${reg.columns.join(", ")}]. Reference the id instead of ` +
          `redefining it, or give your table a distinct id (pack-taxonomy.md rule 2).`,
      );
    }

    for (const sid of pack.schedules) {
      const reg = schedules[sid];
      if (!reg) {
        findings.push(
          `unregistered schedule "${sid}" declared by "${pack.id}" — add it to ` +
            `src/lib/packs/taxonomy.ts with "${pack.id}" as owner, then regenerate taxonomy.json.`,
        );
        continue;
      }
      if (pack.id !== reg.owner) {
        // Schedules have no column contract; any non-owner DECLARE is a
        // second-owner collision (a schedule installs as a pack-scoped
        // composite id, so two owners genuinely diverge).
        findings.push(
          `second owner: schedule "${sid}" is owned by "${reg.owner}" but "${pack.id}" ` +
            `also declares it. Only the owner declares a schedule id (pack-taxonomy.md rule 2).`,
        );
      }
    }
  }
  return findings;
}

/** Orchestrate: read local inputs, reconcile. Throws on broken local input. */
export function runCheck({ root = repoRoot } = {}) {
  const taxonomy = loadTaxonomyJson(root); // throws loudly if broken
  const packs = declaredPrimitives(root);
  const findings = checkTaxonomy(packs, taxonomy);
  const tableCount = packs.reduce((n, p) => n + p.tables.length, 0);
  const scheduleCount = packs.reduce((n, p) => n + p.schedules.length, 0);
  return { findings, packCount: packs.length, tableCount, scheduleCount };
}

// ── CLI entry ────────────────────────────────────────────────────────

function mainCli() {
  let result;
  try {
    result = runCheck();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pack-taxonomy] ERROR — could not run the check: ${msg}`);
    process.exit(1);
  }

  if (result.findings.length === 0) {
    console.log(
      `[pack-taxonomy] OK — ${result.packCount} manifest packs, ` +
        `${result.tableCount} declared tables + ${result.scheduleCount} schedules, ` +
        `all owned + in-contract per src/lib/packs/taxonomy.ts.`,
    );
    return;
  }
  console.error(`[pack-taxonomy] DRIFT — pack manifests disagree with the codified taxonomy:`);
  for (const f of result.findings) console.error(`  - ${f}`);
  console.error(
    `[pack-taxonomy] Fix: reconcile the named pack(s) under ${TEMPLATES_DIR}/ with ` +
      `src/lib/packs/taxonomy.ts (then run node scripts/generate-taxonomy-json.mjs).`,
  );
  process.exitCode = 1;
}

// Run only when invoked directly, never on import (so the pure exports stay
// unit-testable without side effects) — same guard as check-price-drift.mjs.
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
