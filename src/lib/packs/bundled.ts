/**
 * The bundled-pack SSOT (R4 `pack-tarball-diet`, the mechanism half).
 *
 * `BUNDLED_PACK_IDS` is the explicit, single-source allowlist of the packs that
 * ship *inside the npm tarball* (physically present under
 * `src/lib/packs/templates/`, resolved local-first by the sync
 * `resolvePackSource`, zero network). Today this is ALL nine packs — the
 * tarball-diet measurement (206 KB across 9 packs, ~23 KB each) showed the
 * per-pack cost is negligible at the current catalog size, so nothing is cut
 * yet. This list exists so that when the catalog grows to the point the diet
 * pays for itself (see the size gate, `scripts/check-pack-tarball.mjs`), the
 * cut is a one-line data change here, not a scattered edit.
 *
 * This is a **zero-import leaf** on purpose (the `shared-constant-zero-import-leaf`
 * discipline): it is read by runtime code (`catalog.ts`), by the `.json` mirror
 * generator, and — via that mirror — by the plain-`node` size gate, which cannot
 * import a `.ts`. Keep it dependency-free so no module-load cycle can form.
 *
 * INVARIANT (enforced by `bundled.test.ts` + the size gate): this list must
 * exactly equal the set of subdirectories under `templates/`. A pack physically
 * present but absent here — or listed here but missing on disk — is drift that
 * would silently ship (or 404) the wrong set (the `files`-allowlist trap,
 * memory `logo-3d-swap-recipe`).
 */
export const BUNDLED_PACK_IDS = [
  "relay-agency",
  "relay-agency-cre",
  "relay-agency-nonprofit",
  "relay-agency-pro",
  "relay-cre",
  "relay-crm",
  "relay-marketing",
  "relay-nonprofit",
  "relay-social",
  "relay-web-assets",
  "relay-web-designer",
  "relay-web-publisher",
] as const;

export type BundledPackId = (typeof BUNDLED_PACK_IDS)[number];

/** Membership test — is this id one Relay ships bundled (offline, zero network)? */
export function isBundledPack(id: string): boolean {
  return (BUNDLED_PACK_IDS as readonly string[]).includes(id);
}

/**
 * The tarball-diet size trigger, in KILOBYTES of unpacked pack templates. When
 * the total unpacked size of `templates/` crosses this, the diet (slim bundled
 * default + fetch-on-install for the long tail) begins to pay for its
 * complexity, and the size gate FAILS to force the decision. Chosen well above
 * today's measured 206 KB (so it does not fire on normal growth) but below the
 * point templates would meaningfully inflate the ~2.2 MB packed tarball:
 * ~500 KB unpacked ≈ 22 packs ≈ roughly doubling today's template footprint.
 *
 * Raising this is a deliberate act — it means "we have chosen to keep bundling
 * despite the growth"; the honest alternative is to perform the cut (edit
 * `BUNDLED_PACK_IDS` above + move the long tail to fetch-on-install).
 */
export const BUNDLED_TEMPLATES_SIZE_BUDGET_KB = 500;
