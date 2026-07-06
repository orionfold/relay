// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  verifyPackProvenance,
  packProvenanceBytes,
  packInstallPolicy,
  packTierBadge,
  PACK_KEYS,
  PackProvenanceError,
} from "../provenance";
import { signPack, PACK_DEV_KEY_ID } from "./sign-pack-helper";

// R3 `pack-provenance-tiers` — the offline Ed25519 pack-provenance verifier.
// Proves: a good signature by a trusted pack key → its tier; a tampered/unknown/
// unsigned pack → community/unverified (downgrade, never trust); the trust-
// ceiling policy seam; the badge copy; and — the promise-critical criterion —
// the verify makes ZERO network calls.

const META = { id: "relay-demo", name: "Demo", version: "1.0.0" };
const MANIFEST = {
  name: "Demo",
  tables: [],
  profiles: [],
  blueprints: [],
};

describe("verifyPackProvenance", () => {
  it("verifies a pack signed by a trusted official key over correct bytes", () => {
    const sig = signPack(META, MANIFEST);
    const bytes = packProvenanceBytes(META, MANIFEST);
    const result = verifyPackProvenance(bytes, sig, PACK_DEV_KEY_ID);
    expect(result).toEqual({ tier: "official", verified: true, label: "Orionfold" });
  });

  it("downgrades a tampered manifest to community/unverified — never trusted", () => {
    const sig = signPack(META, MANIFEST);
    // Verify the SAME signature against DIFFERENT (tampered) bytes.
    const tampered = packProvenanceBytes(META, {
      ...MANIFEST,
      name: "Evil Demo",
    });
    const result = verifyPackProvenance(tampered, sig, PACK_DEV_KEY_ID);
    expect(result).toEqual({ tier: "community", verified: false });
  });

  it("treats an unsigned pack (sig=null) as community/unverified", () => {
    const bytes = packProvenanceBytes(META, MANIFEST);
    expect(verifyPackProvenance(bytes, null, undefined)).toEqual({
      tier: "community",
      verified: false,
    });
    expect(verifyPackProvenance(bytes, null, PACK_DEV_KEY_ID)).toEqual({
      tier: "community",
      verified: false,
    });
  });

  it("treats a signature by an UNKNOWN key as community/unverified", () => {
    const sig = signPack(META, MANIFEST);
    const bytes = packProvenanceBytes(META, MANIFEST);
    const result = verifyPackProvenance(bytes, sig, "partner-nobody-9999");
    expect(result).toEqual({ tier: "community", verified: false });
  });

  it("downgrades a malformed (non-base64 / wrong-length) signature, never throws", () => {
    const bytes = packProvenanceBytes(META, MANIFEST);
    const result = verifyPackProvenance(bytes, "!!!not-base64!!!", PACK_DEV_KEY_ID);
    expect(result).toEqual({ tier: "community", verified: false });
  });

  it("throws PackProvenanceError only for a structurally broken embedded key", () => {
    const original = PACK_KEYS[PACK_DEV_KEY_ID];
    // Corrupt the embedded key to non-32-byte — a structural fault a real map
    // never has; a signed pack against it must throw, not silently pass.
    PACK_KEYS[PACK_DEV_KEY_ID] = { ...original, publicKeyB64: "AAAA" };
    try {
      const sig = signPack(META, MANIFEST);
      const bytes = packProvenanceBytes(META, MANIFEST);
      expect(() => verifyPackProvenance(bytes, sig, PACK_DEV_KEY_ID)).toThrow(
        PackProvenanceError
      );
    } finally {
      PACK_KEYS[PACK_DEV_KEY_ID] = original;
    }
  });

  it("makes ZERO network calls during verify (100% offline, promise-clean)", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const sig = signPack(META, MANIFEST);
    const bytes = packProvenanceBytes(META, MANIFEST);
    verifyPackProvenance(bytes, sig, PACK_DEV_KEY_ID);
    verifyPackProvenance(bytes, null, undefined);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("packInstallPolicy (trust ceiling — open decision #3)", () => {
  it("installs official/partner verified packs clean", () => {
    expect(packInstallPolicy("official", true)).toBe("install");
    expect(packInstallPolicy("partner", true)).toBe("install");
  });

  it("warn-installs an unverified community pack by DEFAULT", () => {
    expect(packInstallPolicy("community", false)).toBe("warn-install");
  });

  it("REFUSES community when the ceiling is tightened, unless --allow-community", () => {
    // Flipping communityInstallsByDefault to false is the one-line ceiling change.
    expect(
      packInstallPolicy("community", false, {
        communityInstallsByDefault: false,
      })
    ).toBe("refuse");
    expect(
      packInstallPolicy("community", false, {
        communityInstallsByDefault: false,
        allowCommunity: true,
      })
    ).toBe("warn-install");
  });
});

describe("packTierBadge", () => {
  it("renders honest tier badges; community reads as a caution", () => {
    expect(packTierBadge("official", "Orionfold")).toBe("Official · Orionfold");
    expect(packTierBadge("partner", "Acme")).toBe("Partner · Acme");
    expect(packTierBadge("community")).toBe("Community · unverified");
  });
});
