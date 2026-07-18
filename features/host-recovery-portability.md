# G-082 — Encrypted Cell recovery, secrets, and Host portability

## Goal Contract

**Outcome.** A Relay Cell can create a versioned, authenticated, encrypted
recovery bundle in a customer-owned directory, verify it without changing live
state, restore it into a destroyed/empty data root, and prove the restored DB,
files, access state, settings, license data, and local secret root are intact.

**Constraints.** Live SQLite/WAL remains on Host-local storage and is copied
only through SQLite's backup API. Relay never holds a customer recovery key.
The recovery key and destination must be outside the Cell data root. Browser,
API receipts, and support-facing status expose presence and source class, never
key bytes or a raw key path. No network-mounted live SQLite, silent partial
success, cross-Cell restore, or destructive in-process DB replacement.

**Verification.** Manifest/schema/checksum tests; corrupt, truncated, wrong-key,
wrong-Cell, wrong-version and path-traversal negatives; interrupted-copy
reconciliation; two-Cell isolation; key rotation and old-bundle verification;
empty-root Host-loss restore; isolated restore drill; CLI build/runtime smoke;
responsive Settings verification; full tests and production build.

**Operator gates.** A real S3/provider destination, KMS/HSM integration,
automatic retention policy, promised RPO/RTO, credentials, paid services,
publish, push, and release remain gated. This goal ships the provider-neutral
contract and a local-directory transport usable with customer-owned removable
or separately mounted storage; it makes no durability SLA.

**Stop/rescue.** If streaming authenticated encryption cannot remain bounded
and atomically published, retain verified local snapshots and ship no off-Host
success state. If a destructive current-root restore cannot prove quiescence,
keep restore as an offline empty-root CLI operation and an online isolated
drill; never overwrite a live database.

## Scope challenge

- **REDUCE:** checksum the existing plaintext snapshot only. Rejected because
  it does not survive Host/key loss and cannot support customer-owned recovery.
- **PROCEED (selected):** versioned snapshot v2, AES-256-GCM streaming bundle,
  external mode-0600 key file, atomic directory transport, receipts, isolated
  drill, and empty-root restore.
- **EXPAND:** S3 SDK, cloud KMS, Litestream and scheduled provider retention.
  Deferred because those require provider/credential/SLA decisions and do not
  change the portable bundle contract.

## Recovery model

### Artifacts and identities

- Local snapshot v2 contains a live-safe `relay.db` copy, optional
  `relay-auth.db` copy, file archive, per-artifact SHA-256, Cell identity,
  Relay version and format compatibility.
- The encrypted recovery payload additionally contains the Cell-local
  `.keyfile` needed to decrypt provider/runtime settings. It is never copied to
  a plaintext off-Host artifact.
- Every bundle is bound as AES-GCM additional authenticated data to its public,
  content-free header: format, algorithm, Cell ID, Relay version, creation time,
  snapshot ID and random nonce.
- The customer recovery key is an independent 32-byte random key. Relay may
  create it at an explicit CLI path with mode `0600`, but never places it under
  the Cell data root or uploads it beside a bundle.

### State and failures

| State | Meaning | Allowed next states |
|---|---|---|
| `preparing` | live-safe snapshot/payload is being assembled | `encrypting`, `failed` |
| `encrypting` | ciphertext is written to a `.partial` destination | `verifying`, `failed` |
| `verifying` | tag, header, checksums and SQLite integrity are checked | `ready`, `failed` |
| `ready` | atomically named bundle plus content-free receipt exists | drill, empty-root restore, retention |
| `failed` | named reason is recorded; partial artifact is removed | retry |

Named failures distinguish configuration, key permission/length, containment,
Cell/version mismatch, authentication/tag failure, checksum mismatch, unsafe
archive entry, SQLite integrity failure, busy state and non-empty restore root.

### Create, verify, drill, and restore

1. Create a WAL-safe local snapshot and validate every artifact checksum.
2. Stream a fixed allowlist payload through AES-256-GCM to a destination-local
   `.partial`; fsync, append the tag, atomically name a private candidate, then
   hash and self-verify it. Only a passing candidate is promoted to the final
   bundle name and paired with a content-free receipt.
3. Verify decrypts into a private temporary directory, enforces an archive
   allowlist, validates manifest/artifacts and runs SQLite `quick_check` on both
   databases. It removes plaintext staging regardless of outcome.
4. Restore drill performs the same operation and reports measured duration and
   counts without touching live state.
5. Offline restore accepts only a missing or empty target data root. It stages
   and verifies first, then atomically installs the DB, auth DB, secret root and
   file directories. Replacing a live/non-empty root is not a v1 capability.

### Compatibility and rotation

Format v1 accepts snapshot manifest v2 and rejects unknown future versions.
Bundles carry the source Relay version for diagnostics; restore refuses a
future major version. Rotating the customer key affects new bundles only. Old
keys remain necessary for old bundles, so retention/key destruction must be an
explicit operator policy.

## Acceptance criteria

- A customer can create a key and encrypted bundle without exposing secret
  bytes in routine logs, URLs, browser storage, API responses, or receipts.
- A completed bundle cannot exist until authenticated decryption, checksums and
  SQLite integrity pass; interrupted `.partial` files never count as recovery.
- Wrong key, Cell, format/version, checksum, archive path and corrupted/truncated
  ciphertext fail with stable reason codes and leave live state untouched.
- A fresh empty data root can be restored from only the bundle and customer
  key, including auth state and the `.keyfile`; a subsequent verification proves
  DB/files/settings/license/key integrity.
- Two Cells cannot restore one another's bundle even if a Host administrator
  supplies the other Cell's key.
- Settings reports configuration, latest verified recovery age/source and drill
  result without revealing a key or raw key path.
- Existing local snapshot creation/restore and trusted-local behavior remain
  compatible; v1 manifests are readable but cannot be exported as verified v2
  recovery until recreated.

## References

- TDR-044 and TDR-047
- `relay-threat-model.md` TM-007 and TM-011
- [SQLite Online Backup API](https://www.sqlite.org/backup.html)
- [Node.js authenticated cipher APIs](https://nodejs.org/api/crypto.html)
- [OWASP Cryptographic Storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Key Management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)

## Acceptance receipt — 2026-07-17

- Accepted snapshot manifest v2 with Cell/version identity, per-artifact SHA-256,
  SQLite online backups for both Relay and access databases, and fail-closed
  source-file reads. Existing v1 manifests remain readable locally but cannot
  become verified recovery bundles without a new v2 snapshot.
- Accepted the customer-owned AES-256-GCM envelope, external mode-0600 random
  key, authenticated content-free header, fixed extraction allowlist, private
  candidate/self-verification/promotion sequence, content-free atomic receipts,
  explicit retention, key rotation, and named configuration/integrity/busy
  failures. No Orionfold escrow, provider storage, KMS, or RPO/RTO claim exists.
- Accepted offline restore only into a missing/empty root, including Relay DB,
  access DB, Cell secret root, and file directories. A repeatable real-runtime
  smoke started a live isolated Cell, created and verified a bundle, destroyed
  its source root, restored from the customer key and bundle, and proved
  database, representative file, access, and secret integrity.
- Regression evidence: 21 focused snapshot/recovery/API/CLI tests passed; the
  full suite passed 501 files and 3,733 tests with one intentional skip; CLI
  bundling, TypeScript, the 1,582-file token/system-cursor guard, 206-route / 308-
  method API docs, nine guide chapters, the 92-image screenshot manifest, and
  the production build all passed. Existing Turbopack broad-trace warnings
  remain pre-existing and did not fail the build.
- Browser evidence: the Settings recovery card loaded with no console errors,
  exposed no raw configured paths, kept its actions correctly disabled while
  unconfigured, and had no horizontal overflow at 1,440 px or 390 px. The
  configured browser-fixture reload was blocked by the in-app browser URL policy
  and was not bypassed; configured actions remain covered by real route/runtime
  tests.
- Fresh review hardened silent unreadable-file/receipt behavior, prevented a
  final bundle name before self-verification, made drills extract the file
  archive, validated retention inputs, and serialized restores with a target
  lock. No unresolved merge-blocking finding remains.

G-100 owns the fresh packaged, customer-identical combined G-081/G-082 staging
gate. Provider adapters, managed storage, KMS, retention defaults, SLA claims,
push, publish, and release remain separately gated.

## G-100 packaged acceptance receipt — 2026-07-17

- A clean `0.43.0` npm tarball and production-build mirror were installed from
  an empty non-git directory. First-admin, login, session revocation,
  administrator recovery-code rotation, protected-route refusal, exact-origin
  mutation checks, and private/remote ingress credentials all passed with
  their named reason codes.
- The configured Settings recovery card exposed neither key bytes nor raw
  paths and remained internally overflow-free at 1,440 px and 390 px. Create,
  verify, and drill returned `RECOVERY_READY`, `RECOVERY_VERIFIED`, and
  `RECOVERY_DRILL_VERIFIED` with Relay/access DB integrity `ok` and the Cell
  secret root present.
- The first destroyed-source run exposed and closed `F-G100-001`: the snapshot
  and recovery file allowlists omitted the filesystem-backed `licenses/`
  directory. The allowlists and round-trip regression were repaired, then the
  production artifact was rebuilt and the entire run repeated from zero.
- The accepted rerun destroyed the source Cell, restored into a different empty
  root, and started the packaged CLI directly from that root. Health, recovered
  browser/API sessions, the encrypted synthetic setting, valid signed fixture
  license, seeded data, and completed task marker all survived. The evidence
  bundle is `output/staging/2026-07-17-g100-r2/`.
- The reusable G-025 gate accepted Host R2. No public artifact, external
  ingress, production credential, registry write, push, publish, tag, version,
  release, provider durability, KMS, or RPO/RTO claim was authorized.
