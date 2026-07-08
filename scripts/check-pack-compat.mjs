// Publish-gate pack-compat check (R5, _IDEAS/packs-robustify.md Pillar C).
//
// This gate diffs the current bundled pack manifests against a git baseline
// ref (default: origin/main, override with RELAY_PACK_COMPAT_BASE_REF). It
// FAILS CLOSED on breaking changes unless the candidate pack raises its
// relayCore major. New packs and additive primitives are safe.
//
// Usage:
//   node scripts/check-pack-compat.mjs
//   RELAY_PACK_COMPAT_BASE_REF=v0.35.0 node scripts/check-pack-compat.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import semver from "semver";
import yaml from "js-yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const TEMPLATES_DIR = path.join("src", "lib", "packs", "templates");
export const DEFAULT_BASE_REF = "origin/main";

function readYaml(raw, label) {
  try {
    return yaml.load(raw) ?? {};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} is not valid YAML: ${msg}`);
  }
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}

function mapById(items, normalize) {
  const out = {};
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (item && typeof item.id === "string") out[item.id] = normalize(item);
  }
  return out;
}

function collectViewRefs(value, refs = { tables: new Set(), blueprints: new Set(), schedules: new Set() }) {
  if (!value || typeof value !== "object") return refs;
  if (Array.isArray(value)) {
    for (const item of value) collectViewRefs(item, refs);
    return refs;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === "table" && typeof nested === "string") refs.tables.add(nested);
    if (key === "blueprint" && typeof nested === "string") refs.blueprints.add(nested);
    if (key === "schedule" && typeof nested === "string") refs.schedules.add(nested);
    collectViewRefs(nested, refs);
  }
  return refs;
}

function normalizeViewRefs(view) {
  const refs = collectViewRefs(view?.bindings);
  return {
    tables: [...refs.tables].sort(),
    blueprints: [...refs.blueprints].sort(),
    schedules: [...refs.schedules].sort(),
  };
}

export function snapshotPack({ id, packYaml, manifestYaml = null }) {
  const meta = readYaml(packYaml, `${id}/pack.yaml`);
  const manifest = manifestYaml ? readYaml(manifestYaml, `${id}/base/manifest.yaml`) : {};
  return {
    id: typeof meta.id === "string" ? meta.id : id,
    version: typeof meta.version === "string" ? meta.version : "",
    relayCore: typeof meta.relayCore === "string" ? meta.relayCore : "",
    isBundle: Array.isArray(meta.bundle) && meta.bundle.length > 0,
    tables: mapById(manifest.tables, (table) => ({
      columns: asStringArray(table.columns),
    })),
    blueprints: mapById(manifest.blueprints, (blueprint) => ({
      trigger:
        blueprint.trigger && typeof blueprint.trigger === "object"
          ? {
              kind: blueprint.trigger.kind,
              table: blueprint.trigger.table,
            }
          : null,
    })),
    schedules: mapById(manifest.schedules, (schedule) => ({
      runs: typeof schedule.runs === "string" ? schedule.runs : "",
    })),
    viewRefs: normalizeViewRefs(manifest.view),
  };
}

export function loadSnapshotsFromFs(root = repoRoot) {
  const templates = path.join(root, TEMPLATES_DIR);
  const packIds = readdirSync(templates, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const snapshots = {};
  for (const id of packIds) {
    const packYaml = readFileSync(path.join(templates, id, "pack.yaml"), "utf-8");
    let manifestYaml = null;
    try {
      manifestYaml = readFileSync(path.join(templates, id, "base", "manifest.yaml"), "utf-8");
    } catch {
      manifestYaml = null;
    }
    const snap = snapshotPack({ id, packYaml, manifestYaml });
    snapshots[snap.id] = snap;
  }
  return snapshots;
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitShow(root, ref, relPath) {
  try {
    return git(root, ["show", `${ref}:${relPath}`]);
  } catch {
    return null;
  }
}

export function loadSnapshotsFromGitRef(root = repoRoot, ref = DEFAULT_BASE_REF) {
  let packIds;
  try {
    packIds = git(root, ["ls-tree", "-d", "--name-only", `${ref}:${TEMPLATES_DIR}`])
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean)
      .sort();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read pack baseline ref "${ref}": ${msg}`);
  }

  const snapshots = {};
  for (const id of packIds) {
    const packYaml = gitShow(root, ref, path.join(TEMPLATES_DIR, id, "pack.yaml"));
    if (!packYaml) continue;
    const manifestYaml = gitShow(root, ref, path.join(TEMPLATES_DIR, id, "base", "manifest.yaml"));
    const snap = snapshotPack({ id, packYaml, manifestYaml });
    snapshots[snap.id] = snap;
  }
  return snapshots;
}

function minMajor(range) {
  if (!range) return null;
  const min = semver.minVersion(range);
  return min ? min.major : null;
}

function relayCoreMajorRaised(before, after) {
  const from = minMajor(before.relayCore);
  const to = minMajor(after.relayCore);
  return to !== null && (from === null || to > from);
}

function sameTrigger(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.table === b.table;
}

function includes(arr, value) {
  return arr.includes(value);
}

function primitiveStillExists(kind, id, candidate) {
  if (kind === "tables") return Boolean(candidate.tables[id]);
  if (kind === "blueprints") return Boolean(candidate.blueprints[id]);
  if (kind === "schedules") return Boolean(candidate.schedules[id]);
  return false;
}

export function checkPackCompat(baseline, candidate) {
  const findings = [];
  const allowed = [];

  function record(before, after, message) {
    if (after && relayCoreMajorRaised(before, after)) {
      allowed.push(`${message} — allowed because relayCore major changed ${before.relayCore || "(none)"} → ${after.relayCore}`);
    } else {
      findings.push(message);
    }
  }

  for (const before of Object.values(baseline).sort((a, b) => a.id.localeCompare(b.id))) {
    const after = candidate[before.id];
    if (!after) {
      findings.push(`removed pack "${before.id}" — pack removal is breaking for installed customers`);
      continue;
    }

    for (const [tableId, table] of Object.entries(before.tables)) {
      const next = after.tables[tableId];
      if (!next) {
        record(before, after, `breaking table removal: "${before.id}" no longer declares table "${tableId}"`);
        continue;
      }
      for (const col of table.columns) {
        if (!includes(next.columns, col)) {
          record(before, after, `breaking column removal: "${before.id}" table "${tableId}" no longer declares column "${col}"`);
        }
      }
    }

    for (const [blueprintId, blueprint] of Object.entries(before.blueprints)) {
      const next = after.blueprints[blueprintId];
      if (!next) {
        record(before, after, `breaking blueprint removal: "${before.id}" no longer declares blueprint "${blueprintId}"`);
        continue;
      }
      if (!sameTrigger(blueprint.trigger, next.trigger)) {
        record(before, after, `breaking trigger change: "${before.id}" blueprint "${blueprintId}" changed its trigger`);
      }
    }

    for (const scheduleId of Object.keys(before.schedules)) {
      if (!after.schedules[scheduleId]) {
        record(before, after, `breaking schedule removal: "${before.id}" no longer declares schedule "${scheduleId}"`);
      }
    }

    for (const kind of ["tables", "blueprints", "schedules"]) {
      for (const ref of before.viewRefs[kind]) {
        if (primitiveStillExists(kind, ref, after) && !includes(after.viewRefs[kind], ref)) {
          record(before, after, `breaking view binding removal: "${before.id}" no longer exposes ${kind.slice(0, -1)} "${ref}" in view.bindings`);
        }
      }
    }
  }

  return { findings, allowed };
}

export function runCheck({ root = repoRoot, baselineRef = process.env.RELAY_PACK_COMPAT_BASE_REF || DEFAULT_BASE_REF, baseline = null, candidate = null } = {}) {
  const before = baseline ?? loadSnapshotsFromGitRef(root, baselineRef);
  const after = candidate ?? loadSnapshotsFromFs(root);
  const result = checkPackCompat(before, after);
  return {
    ...result,
    baselineRef,
    baselinePackCount: Object.keys(before).length,
    candidatePackCount: Object.keys(after).length,
  };
}

function mainCli() {
  let result;
  try {
    result = runCheck();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[pack-compat] ERROR — could not run the check: ${msg}`);
    process.exit(1);
  }

  if (result.findings.length === 0) {
    console.log(
      `[pack-compat] OK — ${result.candidatePackCount} current packs vs ` +
        `${result.baselinePackCount} baseline packs at ${result.baselineRef}; no breaking manifest drift.`,
    );
    for (const item of result.allowed) console.log(`[pack-compat] allowed: ${item}`);
    return;
  }

  console.error(`[pack-compat] BREAKING DRIFT — current packs are not backward-compatible with ${result.baselineRef}:`);
  for (const finding of result.findings) console.error(`  - ${finding}`);
  console.error(
    `[pack-compat] Fix: restore the removed contract, or raise the pack's relayCore major if this is an intentional breaking change.`,
  );
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURLSafe(process.argv[1])) {
  mainCli();
}

function pathToFileURLSafe(p) {
  if (!p) return "";
  try {
    return new URL(`file://${path.resolve(p)}`).href;
  } catch {
    return "";
  }
}
