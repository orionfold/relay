# G-082 implementation plan

Authoritative specification: `features/host-recovery-portability.md`.

## NOT in scope

- S3/provider SDK and KMS/HSM adapters: provider, credential, retention and
  spending decisions are gated; the local-directory transport proves the same
  bundle/atomicity interface.
- Litestream: continuous DB replication cannot carry files, auth state or the
  secret root and therefore cannot replace the recovery contract.
- In-process destructive restore: an open SQLite process cannot safely prove
  quiescence; v1 restores only to an empty root offline.
- Promised RPO/RTO: record observed drill timings, not an unapproved SLA.

## What already exists

- `snapshot-manager.ts` uses SQLite's online backup API, archives bounded file
  directories, holds a process mutex, reconciles interrupted rows and takes a
  pre-restore snapshot.
- `auto-backup.ts` and `retention.ts` provide scheduling and local-snapshot
  retention; their defaults remain unchanged.
- `utils/crypto.ts` already uses a per-Cell mode-0600 AES-GCM keyfile for local
  encrypted settings. Recovery must carry that root inside ciphertext, not
  invent a second settings-encryption format.
- G-081 provides authenticated APIs, Settings access controls and a separate
  `relay-auth.db` that must join the recovery payload.

## Specification and acceptance mapping

1. **Snapshot v2:** typed manifest, Cell/version metadata, auth DB backup and
   artifact hashes protect complete-state and compatibility criteria.
2. **Recovery crypto/key:** streaming AES-GCM, external key validation, AAD
   header and stable errors protect confidentiality, integrity and key custody.
3. **Transport/receipt:** destination containment, `.partial` + fsync + rename,
   receipt and reconciliation protect atomic publication and retention inputs.
4. **Verify/restore:** allowlisted extraction, checksum/SQLite checks, isolated
   drill and empty-root installation protect corruption and Host-loss criteria.
5. **Surfaces:** CLI, authenticated API and Settings status/actions expose the
   capability without exposing secrets; docs explain custody and limitations.

## Vertical slices

1. Upgrade local snapshot manifests while preserving v1 read compatibility and
   current local restore tests.
2. Add pure recovery format, key, transport and receipt modules with failure
   injection and two-Cell fixtures.
3. Add create/verify/drill/empty-root restore orchestration and offline CLI.
4. Add authenticated recovery status/create/verify/drill routes and the compact
   Settings recovery panel.
5. Update trust/user/API docs and complete runtime/browser/security review.

## Regression test budget

- Existing snapshot create/restore/busy/interrupted tests stay green; add v2
  artifact/auth DB/checksum and v1-not-exportable cases.
- New recovery tests cover round trip, large streamed file, wrong key/Cell,
  corrupt/truncated ciphertext, header/version mismatch, unsafe tar entry,
  partial publish cleanup, key permissions, rotation, retention and empty/non-
  empty target restore.
- Route tests cover missing configuration, create, verify, drill, named errors
  and secret-redacted responses under real temporary filesystem/SQLite state.
- Build the real CLI and run key-create → bundle-create → verify → destroyed-root
  restore → DB/file/key comparison in isolated directories.
- Browser: Settings recovery card at 1440 and 390 px, configured/unconfigured,
  success/error states, keyboard/focus, no overflow, no console errors.
- Then token/doc guards, TypeScript, impacted snapshot suites, full unit suite
  and production build.

## Error & Rescue Registry

| Failure | Required behavior | Rescue |
|---|---|---|
| SQLite/files change during backup | DB remains online-backup consistent; files are one bounded archive | fail checksum/integrity and retry; never publish ready |
| process/transport interruption | `.partial` remains non-authoritative | reconcile/remove partial, record named failure |
| key lost/wrong/weak permissions | no plaintext output | refuse with key reason; customer supplies correct separate key |
| corrupt/tag/checksum/path failure | live data untouched | delete staging, retain ciphertext for diagnosis, named receipt |
| future format/Relay major | refuse before install | use compatible Relay or migration tooling |
| target non-empty/live | refuse destructive restore | use fresh root; manual recovery remains possible |
| auth DB absent on old Cell | mark optional in manifest | restore data and require new first-admin bootstrap |
| secret root absent | mark explicit absence | restore succeeds but encrypted settings remain unavailable until reconfigured |

## Verification order

1. Closest recovery/snapshot tests and CLI source tests.
2. `npm run build:cli` plus isolated real CLI Host-loss smoke.
3. TypeScript, token guard, route/document sync guards.
4. Authenticated dev runtime and browser Settings evidence.
5. Full test suite and `npm run build`.
6. Fresh two-pass security/code review; repair every Pass-1 finding before
   accepting G-082.
