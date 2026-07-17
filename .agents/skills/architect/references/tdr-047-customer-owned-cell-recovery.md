---
id: TDR-047
title: Customer-owned encrypted Cell recovery bundles
status: accepted
date: 2026-07-17
category: infrastructure
---

# TDR-047: Customer-owned encrypted Cell recovery bundles

## Context

Relay keeps live SQLite/WAL and files on Host-local storage. Existing snapshots
use SQLite's online backup API but stay inside the Cell data root, omit the G-081
auth store and local settings key, and have no authenticated off-Host format.
A Host or volume loss therefore remains unrecoverable even though local restore
works. TDR-044 requires customer-owned recovery without turning Relay into a
hosted control plane.

## Decision

1. Keep live SQLite/WAL on Host-local storage. Produce database copies only
   through SQLite's online backup API; never treat a copied live DB file or a
   network-mounted WAL as recovery.
2. Version local snapshot manifests and hash every artifact. Include the
   separate Cell auth DB when present.
3. Define one provider-neutral recovery bundle. A fixed, content-free header is
   AES-256-GCM additional authenticated data; the streamed ciphertext contains
   the verified snapshot plus the Cell-local settings secret root. A 96-bit
   random nonce and 128-bit authentication tag are required.
4. Use an independent random 256-bit customer recovery key stored outside both
   the Cell root and bundle destination. Relay may create a mode-0600 key file
   at an explicit operator path. Relay stores no escrow copy and returns only
   presence/source/fingerprint metadata to browser/support surfaces.
5. Publish through a typed transport using destination-local `.partial`, fsync
   and atomic rename. The first transport is a local directory so removable,
   separately mounted, and test storage can prove the contract; provider
   adapters later implement the same interface.
6. Verification always decrypts to a private temporary directory, enforces a
   fixed archive allowlist, checks hashes and SQLite integrity, and removes
   plaintext staging. A bundle is not `ready` before this succeeds.
7. The online product performs isolated restore drills only. Destructive v1
   recovery is an offline CLI operation into a missing or empty data root, then
   the normal Relay process starts against that root.
8. Rotation creates new keys for new bundles and does not silently re-encrypt
   history. Old keys must remain for retained old bundles; deletion is an
   explicit operator policy.

## Consequences

- Relay can prove destroyed-Host recovery without Orionfold custody, a cloud
  database, KMS, or provider-specific Core branch.
- A customer who loses both bundle and key, or stores them together, cannot be
  recovered by Orionfold. The UI and docs must say this plainly.
- Local-directory transport is not itself a durability claim. Real provider
  storage, access policy, retention and SLA conformance remain later gates.
- Including `.keyfile` inside authenticated ciphertext restores local encrypted
  settings while keeping it out of plaintext manifests and receipts.
- In-process overwrite is intentionally unavailable, reducing a significant
  SQLite corruption and partial-restore risk.

## Alternatives considered

- **Plain tar/zip snapshot:** rejected; exposes all Cell data and keys.
- **Password-derived bundle key:** rejected for v1; human passwords introduce
  KDF/strength/recovery UX and are weaker than an explicit random recovery key.
- **Reuse the Cell `.keyfile`:** rejected; losing the volume would lose the key
  required to decrypt its own backup.
- **Litestream only:** rejected; it does not cover files, auth DB, settings key,
  manifests or full recovery drills.
- **S3/KMS first:** deferred; useful adapter work, but it couples the portable
  format to unresolved provider, credential and retention decisions.

## References

- TDR-044 and TDR-046
- `features/host-recovery-portability.md`
- `src/lib/snapshots/snapshot-manager.ts`
- SQLite Online Backup API, Node.js Crypto, OWASP Cryptographic Storage and Key
  Management guidance
