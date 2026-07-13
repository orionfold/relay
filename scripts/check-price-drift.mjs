// Publish-gate price-drift check (closes _RELAY relay-channel later-12).
//
// The pack's premium price is hand-maintained in
// src/lib/packs/templates/relay-agency-pro/pack.yaml (`price:` block). The
// Website owns the canonical price and publishes it as a machine-readable
// source at https://orionfold.com/relay/pricing.json (operator ruling
// 2026-07-02, §7 of _SPECS/2026-07-01-200629_plg-refine.md). Those two can silently contradict
// each other — the $349-vs-$499 class found in the 2026-07-02 persona smoke
// (F3/#20). This check reads the canonical JSON and fails a release when the
// pack disagrees, structurally killing the drift class.
//
// The ruling constrains HOW we read the canon:
//   - bare GET, NO identifying payload (no auth header, no cookie, no query);
//   - fail-OPEN offline — an unreachable/malformed canon must NOT fail a
//     release (a network blip during publish must never block a good build).
// Only a REACHABLE canon that CONTRADICTS the pack fails the gate.
//
// Usage:
//   node scripts/check-price-drift.mjs            # against the live canon
//   node scripts/check-price-drift.mjs --url file:///tmp/pricing.json
// Exits 0 on ok/skip, 1 only on real drift.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Canonical pricing source published by the Website (operator-ruled SSOT). */
export const CANONICAL_PRICING_URL = "https://orionfold.com/relay/pricing.json";

/** Root dir holding one subdir per bundled pack template. */
export const TEMPLATES_DIR = path.join("src", "lib", "packs", "templates");

const DEFAULT_TIMEOUT_MS = 15_000;

// ── canonical-price normalization ────────────────────────────────────

/**
 * Render a canonical price entry (`{ display, per }`, e.g. `$349` + `year`)
 * into the pack's concatenated string form (`"$349/year"`). The Website
 * splits amount from cadence; the pack stores them joined, so we normalize the
 * canon TO the pack shape rather than parsing the pack's free-text apart.
 * Returns null when the entry is missing/incomplete so the diff can report it.
 */
export function canonicalDisplay(entry) {
  if (!entry || typeof entry.display !== "string" || typeof entry.per !== "string") {
    return null;
  }
  return `${entry.display}/${entry.per}`;
}

/**
 * Pure diff between the pack's `price` block and the canonical pricing JSON.
 * Returns an array of drift findings (empty ⇒ in sync). No I/O — every input
 * is already-parsed data, so this is the unit-tested source of truth for the
 * comparison rules.
 *
 * Rules:
 *   1. pack.price.list  must equal canonical prices.list  (display+per)
 *   2. pack.price.intro must equal canonical prices.founding (display+per)
 *      — ONLY while the founding window is open.
 *   3. window closed but pack still carries intro/note ⇒ stale founding price
 *      (the pack.yaml comment says to delete intro+note when the window
 *      closes; this catches a forgotten deletion).
 *   4. window open but pack has NO intro ⇒ the founding price the Website is
 *      still selling is invisible on the locked card.
 */
export function diffPrice(packPrice, canonical) {
  const findings = [];
  const prices = canonical?.prices ?? {};
  const windowOpen = canonical?.founding_window?.state === "open";

  // Rule 1 — list price must always match.
  const canonList = canonicalDisplay(prices.list);
  const packList = typeof packPrice?.list === "string" ? packPrice.list : undefined;
  if (canonList === null) {
    findings.push(`canonical prices.list missing/incomplete (cannot verify list price)`);
  } else if (packList !== canonList) {
    findings.push(
      `list price drift: pack.yaml has "${packList ?? "(none)"}", canon has "${canonList}"`,
    );
  }

  // Rules 2–4 — founding/intro price gated on the founding window state.
  const canonFounding = canonicalDisplay(prices.founding);
  const packIntro = typeof packPrice?.intro === "string" ? packPrice.intro : undefined;

  if (windowOpen) {
    if (canonFounding === null) {
      findings.push(
        `founding window is open but canonical prices.founding is missing/incomplete`,
      );
    } else if (packIntro === undefined) {
      findings.push(
        `founding window is open (canon founding "${canonFounding}") but pack.yaml has no intro price — the founding offer is invisible on the locked card`,
      );
    } else if (packIntro !== canonFounding) {
      findings.push(
        `founding price drift: pack.yaml intro "${packIntro}", canon founding "${canonFounding}"`,
      );
    }
  } else {
    // Window closed (or absent): the pack must not still advertise an intro.
    if (packIntro !== undefined) {
      const state = canonical?.founding_window?.state ?? "(no founding_window)";
      findings.push(
        `founding window is "${state}" but pack.yaml still carries intro "${packIntro}" — delete intro + note (pack.yaml comment)`,
      );
    }
  }

  return findings;
}

// ── I/O boundaries ───────────────────────────────────────────────────

/**
 * Discover every PREMIUM pack template (one carrying an `entitlement:` — i.e.
 * a paid pack whose card shows the license price) and read its `price` block.
 * Returns `[{ id, price }]` sorted by id. Free packs (no entitlement) have no
 * price to gate and are skipped. Throws on a malformed pack.yaml — the pack is
 * OUR source, so a broken one is a real error, not a fail-open.
 *
 * Generalized from a single hardcoded relay-agency-pro path (2026-07-05): the
 * four industry/bundle packs carried a stale `$199` the old single-path gate
 * never saw. Globbing every entitlement-bearing pack closes that blind spot so
 * a new paid pack is gated automatically, with no script edit.
 */
export function premiumPackPrices(root = repoRoot) {
  const dir = path.join(root, TEMPLATES_DIR);
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const out = [];
  for (const id of entries) {
    const packYaml = path.join(dir, id, "pack.yaml");
    let raw;
    try {
      raw = readFileSync(packYaml, "utf-8");
    } catch {
      continue; // a template dir without a pack.yaml (e.g. a bundle child) — skip
    }
    const meta = yaml.load(raw);
    if (!meta?.entitlement) continue; // free pack — no license price to gate
    out.push({ id, price: meta.price ?? null });
  }
  return out;
}

/**
 * Bare GET of the canonical pricing JSON. NO identifying payload: no auth, no
 * cookie, no query string, default headers only. Fails OPEN — any network,
 * timeout, HTTP, or parse error resolves to `{ ok: false, reason }` instead of
 * throwing, so the caller can skip (not fail) the gate offline.
 */
export async function fetchCanonicalPricing(url = CANONICAL_PRICING_URL, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status} from ${url}` };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `fetch failed: ${msg}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Orchestrate the check. Returns:
 *   { status: "ok",      findings: [] }               — canon reachable, in sync
 *   { status: "drift",   findings: [...] }             — canon reachable, mismatch
 *   { status: "skipped", reason }                      — canon unreachable (fail-open)
 * Never throws for a network condition; only a broken local pack.yaml throws.
 */
export async function checkPriceDrift({
  root = repoRoot,
  url = CANONICAL_PRICING_URL,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const packs = premiumPackPrices(root); // local read — throws loudly if broken
  const fetched = await fetchCanonicalPricing(url, timeoutMs);
  if (!fetched.ok) {
    return { status: "skipped", reason: fetched.reason };
  }
  // Every premium pack shows the SAME license offer, so each diffs against the
  // same canon; prefix each finding with the pack id so a drift names the pack.
  const findings = packs.flatMap(({ id, price }) =>
    diffPrice(price, fetched.data).map((f) => `${id}: ${f}`),
  );
  return { status: findings.length === 0 ? "ok" : "drift", findings };
}

// ── CLI entry ────────────────────────────────────────────────────────

function parseUrlArg(argv) {
  const i = argv.indexOf("--url");
  return i !== -1 ? argv[i + 1] : CANONICAL_PRICING_URL;
}

async function mainCli() {
  const url = parseUrlArg(process.argv);
  const result = await checkPriceDrift({ url });

  if (result.status === "skipped") {
    // Fail-open: a release must not be blocked by an offline canon.
    console.log(`[price-drift] SKIPPED — canonical pricing unreachable (${result.reason}).`);
    console.log(`[price-drift] fail-open: the pack price stays hand-maintained until the canon is reachable.`);
    return;
  }
  if (result.status === "ok") {
    console.log(`[price-drift] OK — pack.yaml price matches ${url}.`);
    return;
  }
  console.error(`[price-drift] DRIFT — a premium pack.yaml disagrees with the canonical pricing:`);
  for (const f of result.findings) console.error(`  - ${f}`);
  console.error(
    `[price-drift] Fix: reconcile the named pack(s) under ${TEMPLATES_DIR}/ with ${url}, or flag the intended change on strategy/relay/_RELAY.md.`,
  );
  process.exitCode = 1;
}

// Run only when invoked directly, never on import (so the pure exports above
// stay unit-testable without side effects).
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
