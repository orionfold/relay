# Relay Cell encrypted recovery

Relay can package one complete Cell into a versioned, encrypted recovery bundle
owned by the customer. The bundle includes a live-safe SQLite backup, the
administrator access store, Cell files, settings and license rows, and the
Cell-local secret root used by encrypted settings. Orionfold does not receive
or retain the recovery key.

This is different from a local snapshot. Snapshots support convenient rollback
on the same Host. A recovery bundle is encrypted and designed to be stored away
from the Host so a lost laptop, VM, or disk can be rebuilt.

## Configure a key and destination

Create a random 32-byte recovery key at an explicit path outside both the Cell
data directory and the bundle destination:

```bash
relay recovery key create --out /secure-keys/relay-cell-a.key
```

The command creates a new mode-`0600` file and refuses to overwrite an existing
file. Keep an independent protected copy. Losing the key makes its bundles
unrecoverable; Orionfold cannot recreate it.

Configure a separate customer-owned destination and restart Relay:

```bash
export RELAY_RECOVERY_KEY_FILE=/secure-keys/relay-cell-a.key
export RELAY_RECOVERY_DESTINATION=/mounted-backups/relay-cell-a
```

The destination must be outside `RELAY_DATA_DIR`. The v1 transport is a local
directory, so it can point to customer-owned removable or separately mounted
storage. Relay does not claim an RPO, RTO, replication, or cloud durability SLA
for that directory. Never place the key beside its bundles.

## Create, verify, and drill

Use **Settings → Encrypted recovery**, or run:

```bash
relay recovery create \
  --destination /mounted-backups/relay-cell-a \
  --key-file /secure-keys/relay-cell-a.key

relay recovery verify \
  --bundle /mounted-backups/relay-cell-a/<bundle>.relay-recovery \
  --key-file /secure-keys/relay-cell-a.key

relay recovery drill \
  --bundle /mounted-backups/relay-cell-a/<bundle>.relay-recovery \
  --key-file /secure-keys/relay-cell-a.key
```

Create uses SQLite's online backup API, hashes every artifact, encrypts with
AES-256-GCM, decrypts the candidate, validates Cell/version identity and
checksums, runs SQLite `quick_check`, and only then promotes it to a completed
`.relay-recovery` file. Verify repeats the authenticated checks without changing
live state. Drill additionally extracts and validates the Cell file archive in
an isolated temporary directory. Each operation writes a content-free receipt
with a stable reason code; key bytes and raw configured paths are not returned
to the browser.

Key rotation applies only to new bundles. Retain each old key as long as a
bundle encrypted by it remains in retention. Optional cleanup is explicit:

```bash
relay recovery prune --destination /mounted-backups/relay-cell-a \
  --cell-id cell-a --max-count 10 --max-age-days 30
```

## Restore after Host loss

Stop Relay. Restore is intentionally an offline CLI operation and accepts only
a missing or empty destination, so it cannot overwrite a running Cell:

```bash
relay recovery restore \
  --bundle /mounted-backups/relay-cell-a/<bundle>.relay-recovery \
  --key-file /secure-keys/relay-cell-a.key \
  --target-data-dir /srv/relay/cell-a
```

Relay verifies and stages everything first, then installs the database, access
state, secret root, and files together. Start the restored Cell with that data
root and the same Cell identity. A wrong key, wrong Cell id, future incompatible
Relay major version, damaged bundle, unsafe archive path, failed database check,
or non-empty target fails with a named error and leaves the target untouched.

For a real continuity check, periodically copy one bundle and its separately
stored key into a disposable environment, destroy the disposable source Cell,
restore into an empty root, and prove sign-in plus representative files and
workflows. A successful create receipt is evidence of a verified artifact, not
a substitute for a customer-run disaster-recovery exercise.
