// Pack provenance & trust tiers (R3 `pack-provenance-tiers`).
//
// A distributed pack needs a TRUST STORY: an official Orionfold pack, a
// registered partner's pack, and an anonymous community pack must be
// distinguishable, and that distinction must be provable 100% OFFLINE — no
// registry lookup, promise-clean under "Relay never sends your data to
// Orionfold" (memory `phone-home-definition`).
//
// This module delivers it by REUSING the shipped Ed25519 license verifier
// verbatim: the same canonical-bytes contract (`licensing/canonicalize`), the
// same DER/SPKI raw-key wrapping, the same offline-verify discipline. A pack
// signature is a license signature in a different hat — so R3 adds a
// pack-provenance sibling, NOT a new crypto stack.
//
// The trust anchor is a SEPARATE embedded key map (`PACK_KEYS`) — a pack-signing
// key and a license-signing key are different ROLES, so we never overload the
// licensing `TRUSTED_KEYS`. The three tiers map onto the map: `official` =
// signed by a canonical Orionfold pack key, `partner` = signed by a registered
// partner key, `community` = unsigned or signed by an unknown key.
//
// PURE crypto leaf — imports only `node:crypto`, the licensing `canonicalize`
// leaf, and `js-yaml`/nothing-runtime-adjacent. It never pulls the
// `@/lib/agents/runtime/catalog.ts` module-load-cycle chain, so the install path
// and any UI surface can consume it (memory `shared-constant-zero-import-leaf`).
import crypto from "node:crypto";
import { canonicalBytes } from "@/lib/licensing/canonicalize";

/** The three trust tiers. Mirrors `PackTierSchema` (index-schema.ts) — kept as a
 * plain union here so this leaf imports no zod. */
export type PackTier = "official" | "partner" | "community";

/** DER/SPKI prefix wrapping a raw 32-byte Ed25519 public key into a KeyObject.
 * Byte-identical to `licensing/verify.ts:43` — the same raw-key contract. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/**
 * Embedded trusted PACK-SIGNING keys, keyed by `keyId`. Standard base64 of the
 * raw 32-byte Ed25519 public key (NOT base64url, NOT DER/PEM) — same encoding as
 * the licensing `TRUSTED_KEYS`.
 *
 * DISTINCT from the license key map by design: signing a pack and signing a
 * license are different roles. `of-packs-*` keys are Orionfold-canonical.
 * Partner keys enter here via open decision #4 (onboarding path — coordinate
 * with the licensing issuer owner); the map has the placeholder slot below.
 *
 * - `of-packs-dev-2026` — throwaway DEV key whose public half equals the shared
 *   conformance dev key (`of-license-dev-2026-06`, seed = bytes(range(32))).
 *   NEVER signs a real distributed pack. Trusted only so the offline provenance
 *   test can prove the verify path against a locally-signed fixture, exactly
 *   like the licensing conformance dev key. Tiered `official` so the same
 *   fixture exercises the official badge; a real `of-packs-official-*` key
 *   replaces it before any partner/community pack ships.
 */
export const PACK_KEYS: Record<
  string,
  { publicKeyB64: string; tier: "official" | "partner"; label: string }
> = {
  "of-packs-dev-2026": {
    publicKeyB64: "A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=",
    tier: "official",
    label: "Orionfold",
  },
  // Partner keys added here (open decision #4 — onboarding path):
  // "partner-acme-2026": { publicKeyB64: "…", tier: "partner", label: "Acme" },
};

/** Named error so every provenance fault is visible and typed (Principle #2).
 * Thrown ONLY for a structural fault a well-formed key map should never hit
 * (embedded key not a 32-byte Ed25519 key). An unknown/absent signature is NOT
 * a fault — it is a legitimate `community/unverified` outcome, returned. */
export class PackProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackProvenanceError";
  }
}

/**
 * The exact bytes a pack signature covers: `canonicalize({ meta, manifest })`.
 *
 * Canonicalize the PARSED objects, never the raw YAML file text — YAML
 * re-serialization is not byte-stable (key order, quoting, whitespace all
 * drift), so raw-bytes signing would be fragile across authoring tools. The
 * parsed-object canonical form is the same discipline licensing uses (sign over
 * the canonical payload, never the pretty-printed envelope). Signer and verifier
 * MUST feed the identical `{ meta, manifest }` shape — the pack.yaml meta and
 * the clean base AppManifest, both post-parse.
 */
export function packProvenanceBytes(
  meta: unknown,
  manifest: unknown
): Uint8Array {
  return canonicalBytes({ manifest, meta });
}

function publicKeyFor(keyId: string): crypto.KeyObject {
  const b64 = PACK_KEYS[keyId].publicKeyB64;
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) {
    throw new PackProvenanceError(
      `Pack key ${keyId} is not a 32-byte Ed25519 key (got ${raw.length} bytes)`
    );
  }
  const der = Buffer.concat([ED25519_SPKI_PREFIX, raw]);
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

export interface ProvenanceResult {
  tier: PackTier;
  verified: boolean;
  /** The signer's human label (e.g. "Orionfold"), present only when verified. */
  label?: string;
}

/**
 * Verify a pack's provenance 100% offline and assign a trust tier.
 *
 * A pack that is unsigned, signed by an unknown key, or whose signature does not
 * verify over the canonical bytes ALL resolve to `community / unverified` — a
 * downgrade, never a trust. Only a good signature by an embedded key earns its
 * `official`/`partner` tier. This is the OPPOSITE posture from the license
 * verifier (which throws on an untrusted key): here an unknown signer is a
 * normal community outcome, not an operator-visible refusal.
 */
export function verifyPackProvenance(
  packBytes: Uint8Array,
  sig: string | null | undefined,
  keyId: string | undefined
): ProvenanceResult {
  if (!sig || !keyId) return { tier: "community", verified: false };
  const known = PACK_KEYS[keyId];
  if (!known) return { tier: "community", verified: false }; // unknown key → unverified
  const key = publicKeyFor(keyId);
  const sigBytes = Buffer.from(sig, "base64");
  let ok = false;
  try {
    ok = crypto.verify(null, packBytes, key, sigBytes);
  } catch {
    // A malformed signature buffer verifies as false, never throws upward — a
    // corrupt sig is a downgrade, not a crash (Principle #3, shadow path).
    ok = false;
  }
  if (!ok) return { tier: "community", verified: false }; // bad sig → downgrade, never trust
  return { tier: known.tier, verified: true, label: known.label };
}

export type PackInstallDecision = "install" | "warn-install" | "refuse";

export interface PackInstallPolicyOptions {
  /** When false (the tightened ceiling), an unverified community pack refuses
   * unless the caller passes `allowCommunity`. Defaults true — warn-and-install
   * (open decision #3, the recommended default; flipping this to `false` is the
   * one-line ceiling change). */
  communityInstallsByDefault?: boolean;
  /** The `--allow-community` escape hatch. Only consulted when the default is
   * tightened; ignored while `communityInstallsByDefault` is true. */
  allowCommunity?: boolean;
}

/**
 * The trust-ceiling policy seam (open decision #3). One function to change when
 * the operator finalizes the ceiling — every install-side gate reads its verdict
 * rather than branching on the tier shape.
 *
 * DEFAULT (warn-and-install): official/partner install clean; an unverified
 * community pack warns loudly but installs (Principle #1 — surfaced, never
 * silent), mirroring the Skills "trust-the-source" model. Flipping
 * `communityInstallsByDefault` to false refuses community unless
 * `--allow-community` — proven by the policy unit test.
 */
export function packInstallPolicy(
  tier: PackTier,
  verified: boolean,
  opts: PackInstallPolicyOptions = {}
): PackInstallDecision {
  const { communityInstallsByDefault = true, allowCommunity = false } = opts;
  if (verified && (tier === "official" || tier === "partner")) return "install";
  // Everything else is unverified community (an unverified official/partner is
  // downgraded upstream, but treat it here defensively as community too).
  if (communityInstallsByDefault) return "warn-install";
  return allowCommunity ? "warn-install" : "refuse";
}

/**
 * The tier badge shown wherever a pack is surfaced (CLI install output, the
 * /packs card). A small helper so call sites never branch on the raw tier shape
 * — same discipline as `packPrice()` / the recap surfaces (memory
 * `packs-license-price-is-shared-not-per-pack`).
 *
 * "Community · unverified" reads as a CAUTION, not a neutral label (taste:
 * honest, not alarmist).
 */
export function packTierBadge(tier: PackTier, label?: string): string {
  switch (tier) {
    case "official":
      return `Official · ${label ?? "Orionfold"}`;
    case "partner":
      return `Partner · ${label ?? "verified"}`;
    case "community":
      return "Community · unverified";
  }
}
