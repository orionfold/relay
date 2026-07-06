---
title: Pack provenance & trust tiers — offline Ed25519 verify, official/partner/community (R3)
status: built
priority: P1
milestone: post-mvp
source: _IDEAS/packs-publish.md §5 (Pillar B) / §10 R3
dependencies: [pack-canonical-index]
---

# Pack provenance & trust tiers — the offline signature verifier (R3)

## Description

A distributed pack needs a **trust story**: an official Orionfold pack, a registered partner's
pack, and an anonymous community pack must be distinguishable, and that distinction must be
provable **100% offline** (no registry lookup, promise-clean). This feature delivers it by
**reusing the shipped Ed25519 license verifier verbatim** — the same embedded trusted-key map
(`verify.ts:37-40`), the same canonical-bytes contract (`canonicalize.ts`), the same
offline-verify discipline that already proves a license. A pack carries a sibling `pack.sig` (a
signature over `canonicalize(pack.yaml + base manifest)`); the install path verifies it against
the embedded key map and assigns a trust tier.

The three tiers map directly onto the key map: **official** = signed by a canonical Orionfold
pack key (e.g. `of-packs-official-2026`), **partner** = signed by a registered partner key in the
embedded map, **community** = unsigned or signed by an unknown key. Each surfaces a badge
("Official · Orionfold", "Partner · Acme", "Community · unverified"). The tier *semantics* come
from the completed `marketplace-trust-ladder.md` (private → community → verified → official); the
*offline proof* comes from the Ed25519 verifier. The two combine cleanly — the ladder says what a
tier means, the signer proves what tier a pack is.

This mirrors shipped licensing almost exactly, so blast radius is **S**. It is needed before
partner/community packs install (R2 fetches them; R3 tells the user whether to trust them). The
**trust ceiling** — whether an unsigned community pack installs by default — is open decision #3;
this spec builds the *verifier + badge* and implements the recommended **warn-and-install**
default behind a small policy seam so the ceiling can be tightened without a rebuild.

## User Story

As a Relay user installing a pack from the canonical index, I want the product to tell me — 100%
offline, no phone-home — whether the pack is officially signed by Orionfold, signed by a
registered partner, or an unverified community pack, so that I can decide whether to trust code I
am about to install, with the trust level shown honestly and never silently assumed.

## Technical Approach

### Reuse the shipped verifier — a pack signature is a license signature in a different hat

The licensing verifier already has every piece: `TRUSTED_KEYS` (`verify.ts:37-40`, an embedded
`Record<keyId, base64-pubkey>`), the DER/SPKI wrapping (`verify.ts:43`), the
`LicenseVerificationError` named-error pattern, and `canonicalize.ts` (recursive key-sort,
byte-for-byte shared by signer and verifier). R3 adds a **pack-provenance sibling**, not a new
crypto stack:

```ts
// src/lib/packs/provenance.ts (new; reuses licensing/verify + canonicalize)
export type PackTier = "official" | "partner" | "community";

const PACK_KEYS: Record<string, { tier: "official" | "partner"; label: string }> = {
  "of-packs-official-2026": { tier: "official", label: "Orionfold" },
  // partner keys added here (open decision #4 — onboarding path):
  // "partner-acme-2026": { tier: "partner", label: "Acme" },
};

export function verifyPackProvenance(
  packBytes: Buffer,          // canonicalize(pack.yaml + base manifest)
  sig: string | null,
  keyId: string | undefined
): { tier: PackTier; verified: boolean; label?: string } {
  if (!sig || !keyId) return { tier: "community", verified: false };
  const known = PACK_KEYS[keyId];
  if (!known) return { tier: "community", verified: false };   // unknown key → unverified
  const ok = ed25519Verify(packBytes, sig, keyId);             // reuse the licensing verify primitive
  if (!ok) return { tier: "community", verified: false };      // bad sig → downgrade, never trust
  return { tier: known.tier, verified: true, label: known.label };
}
```

The embedded pack-key map is a **new leaf** (mirrors `TRUSTED_KEYS`) — do NOT overload the
license key map; a pack-signing key and a license-signing key are different roles. `of-packs-*`
keys are Orionfold-canonical; partner keys enter via open decision #4.

### Wire into the install path (after R2 fetch, before write)

`installPack` already threads the `entry` from R2 (`{ dir, entry }`). Add a provenance step
**after acquire, before the license gate**: compute `canonicalize(pack.yaml + base manifest)`
from the fetched dir, call `verifyPackProvenance(bytes, entry.sig, entry.keyId)`, attach the tier
to the install result, and apply the **trust-ceiling policy** (below). A **bundled** pack is
implicitly `official` (it shipped signed-in-tarball) and skips the fetch-side verify — bundled =
Orionfold-authored by definition.

### The trust ceiling (open decision #3 — build the seam, default to warn-and-install)

Three options: (a) warn-and-install (Skills "trust-the-source" model — **recommended**), (b)
refuse unless `--allow-community`, (c) refuse until the key is registered. Build a small policy
function `packInstallPolicy(tier, verified, opts)` returning `"install" | "warn-install" |
"refuse"` so the ceiling is one function to change. **Default: warn-and-install for community,
loudly** (Principle #1 — surfaced, never silent), install-clean for official/partner. The
`--allow-community` flag is wired but defaults on; flipping the default to opt-in is a one-line
policy change when the operator resolves #3.

### The badge (trust surface)

Surface the tier wherever a pack is shown (the `/packs` card, the CLI install output). Reuse the
`packPrice()` / recap-surface rendering discipline — a small `packTierBadge(tier, label)` helper,
never branch on raw tier shape at call sites. "Community · unverified" must read as a caution, not
a neutral label (taste: honest, not alarmist).

## Acceptance Criteria

- [x] `src/lib/packs/provenance.ts` exports `verifyPackProvenance`, `PackTier`, the embedded
      `PACK_KEYS` map, `packInstallPolicy`, `packProvenanceBytes`, and `packTierBadge`; reuses
      `licensing/canonicalize` + the `node:crypto` Ed25519 primitive (no new crypto). NOTE: uses
      the lower-level `crypto.verify`, NOT `licensing/verify`'s `verifyLicense` — the license
      verifier THROWS on an untrusted key, but here an unknown signer is a legitimate
      `community/unverified` OUTCOME (the opposite posture), so it can't be reused wholesale.
- [x] A pack signed by a trusted pack key (`of-packs-dev-2026`, whose public half equals the
      shared conformance dev key) over correct canonical bytes verifies as
      `{ tier: "official", verified: true }`; a **tampered** manifest (bytes ≠ signed) downgrades
      to `{ tier: "community", verified: false }` — never trusted. (`provenance.test.ts` +
      end-to-end via a signed `file://` index in `install.test.ts`.)
- [x] An unsigned pack (`sig: null`) and a pack signed by an **unknown** key both resolve to
      `community / unverified`.
- [x] A **bundled**/local pack installs as `official` without a fetch-side verify (no `indexEntry`
      → implicit official); proven by the local-install report-tier assertion.
- [x] `packInstallPolicy` returns `warn-install` for unverified community by default and
      `install` for official/partner; a unit test proves flipping the policy to opt-in refuses
      community without `--allow-community`. `--allow-community` flag wired through the CLI.
- [x] Install output shows the tier badge (`Installed …@… [Official · Orionfold]`, verified by a
      `tsx` CLI smoke); the `/packs` card carries a subtle official trust line. "Community ·
      unverified" renders as a caution.
- [x] Provenance verify is **100% offline** — a test spies on `globalThis.fetch` and asserts no
      network call during verify.
- [x] `npm test` green (304 packs+licensing tests pass; 0 new regressions).

### Build notes (2026-07-06)

- **`PACK_KEYS` shape differs from the sketch:** it maps `keyId → { publicKeyB64, tier, label }`
  (self-contained, no cross-import into `TRUSTED_KEYS`) rather than looking the key up in the
  license map. Pack-signing and license-signing are distinct roles (spec's own rule), so the
  embedded pack-key map holds its own public bytes.
- **Signed bytes = `canonicalize({ manifest, meta })` over the PARSED objects**, never raw YAML
  file text (YAML re-serialization isn't byte-stable). Signer + verifier both feed the
  post-`parsePack` `meta`+`manifest`. Test signer: `__tests__/sign-pack-helper.ts` (reuses the
  conformance dev seed under the `of-packs-dev-2026` slot).
- **`of-packs-dev-2026` is a DEV placeholder** tiered `official` so the offline test exercises the
  official badge; a real `of-packs-official-2026` key replaces it before any partner/community
  pack ships (open decision #4).

## Scope Boundaries

**Included:**
- The offline pack-provenance verifier reusing the licensing Ed25519 stack.
- The embedded `of-packs-*` key map (leaf) + the tier assignment.
- The trust-ceiling policy seam (default warn-and-install) + `--allow-community` flag.
- The tier badge on install output + `/packs` card.

**Excluded (separate requirements):**
- **Partner-key onboarding** (how `partner-*` keys enter `PACK_KEYS`) → open decision #4,
  coordinate with the licensing issuer owner. The map has a placeholder; the onboarding *process*
  is out of scope.
- **Signing** a pack (the author side) → part of `pack-community-publish.md` (R7 — the exporter
  self-signs with the customer's key).
- **Finalizing** the trust ceiling default → open decision #3 (the seam is built; the value is a
  one-line change).
- **The license entitlement gate** — unchanged (`install.ts:182-197`); provenance (who signed)
  and entitlement (is it paid + licensed) are orthogonal.

## References

- Source: `_IDEAS/packs-publish.md` §5 (Pillar B — reuse the verifier, the tier table, the
  ceiling) + §10 R3.
- Code anchors (verified 2026-07-06): `src/lib/licensing/verify.ts:37-40` (`TRUSTED_KEYS`
  embedded map — the mechanism reused), `verify.ts:43` (DER/SPKI wrap), `verify.ts:46-49`
  (`LicenseVerificationError` named-error pattern), `src/lib/licensing/canonicalize.ts` (shared
  canonical bytes), `install.ts:182-197` (the entitlement gate this sits beside, not inside).
- Tier semantics prior art: `marketplace-trust-ladder.md` (status completed —
  private→community→verified→official).
- Depends on: `pack-canonical-index.md` (R1 — `entry.sig`/`entry.keyId` come from the index) and
  reads the `entry` R2 threads through.
- Enables: `pack-community-publish.md` (R7 — community IS a tier defined here).
- Open decision #3 (trust ceiling), #4 (partner-key onboarding — coordinate with issuer owner).
- Memory: `anthropic-direct-mcp-servers-remote-only` (offline-verify discipline),
  `phone-home-definition`, `packs-license-price-is-shared-not-per-pack` (badge rendering
  discipline), `check-git-history-for-prior-art`.
