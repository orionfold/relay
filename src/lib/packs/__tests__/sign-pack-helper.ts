import crypto from "node:crypto";
import { packProvenanceBytes } from "../provenance";
import vector from "../../licensing/__tests__/fixtures/license-conformance-v1.json";

/**
 * Test-only pack signer using the throwaway DEV seed from the shared
 * conformance vector — the same seed whose PUBLIC half is registered under the
 * `of-packs-dev-2026` slot in `PACK_KEYS` (verify.ts's dev key public bytes).
 * This lets the offline provenance test prove the verify path against a
 * locally-signed fixture with no real key material, exactly mirroring
 * `licensing/__tests__/sign-helper.ts`.
 *
 * Signs over `packProvenanceBytes(meta, manifest)` — the identical canonical
 * bytes the verifier recomputes from the parsed pack.
 */
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex"
);

export const PACK_DEV_KEY_ID = "of-packs-dev-2026";

export function signPack(meta: unknown, manifest: unknown): string {
  const seed = Buffer.from(vector.dev_key.private_seed_b64, "base64");
  const key = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  return crypto
    .sign(null, packProvenanceBytes(meta, manifest), key)
    .toString("base64");
}
