# Run Relay Host on a compatible Linux VM

This playbook prepares Relay Host on an ordinary virtual machine that you own.
It is cloud-provider neutral: you create the VM in your chosen provider, while
Relay supplies the checked software setup and tells you whether the machine
meets the supported baseline.

This is a **portable playbook**, not a promise that every provider is verified.
DigitalOcean is currently the named provider with a completed live Relay
conformance run. Other named providers receive that label only after their own
recovery, rollback and cleanup proof.

## Before you begin

You need:

- Ubuntu 24.04 LTS on x86_64;
- at least 2 vCPU, 4 GiB RAM and 80 GiB disk;
- a public IPv4 address, working DNS/outbound HTTPS and synchronized time;
- an SSH public key and an administrator IP address you can allow through the
  provider firewall;
- a hostname you control if Relay will be reachable over the internet; and
- an exact Relay version. Use the version from your fulfillment message or a
  published Relay release, never an unreviewed prerelease.

The provider account, VM, bill, firewall, DNS and backups stay under your
control. Relay does not ask for or retain your cloud API credential.

## 1. Render the checked cloud-init file

Install the exact Relay package on your administrator computer or run its
versioned command with `npx`:

```bash
export RELAY_VERSION='<X.Y.Z>'
npx --yes --package "orionfold-relay@$RELAY_VERSION" \
  relay-host-playbook manifest
npx --yes --package "orionfold-relay@$RELAY_VERSION" \
  relay-host-playbook render \
  --ssh-public-key-file "$HOME/.ssh/id_ed25519.pub" \
  --hostname relay-host \
  --output relay-host-cloud-init.yaml
```

The renderer accepts only a public SSH key and one lowercase hostname label.
It refuses license files, passwords, tokens, API/model keys, recovery keys,
private keys, provider credentials and secret-like values. Do not edit secrets
into the generated file: cloud providers commonly retain user-data.

## 2. Create the VM

In your provider's console, create one VM matching the baseline. Paste the
entire generated `relay-host-cloud-init.yaml` into the field called
**cloud-init**, **user data**, **custom data** or **startup configuration**.

Use these network defaults:

- allow TCP 22 only from your administrator IP;
- allow TCP 80 and 443 from the clients that should reach Relay;
- do not open Relay port 3000, Docker's API or Cell/runtime ports; and
- keep provider metadata and private service networks unreachable from clients.

Write down the provider resource IDs for the VM, disk, address, firewall, DNS
record and snapshot/backup. That worksheet is the cleanup authority later.

## 3. Wait for Relay's receipt—not merely a “running” VM

Connect as the separate `relayadmin` operator and wait for cloud-init itself.
The `relay` account is a locked service identity and cannot sign in:

```bash
ssh relayadmin@<server-address>
sudo cloud-init status --wait
sudo cat /var/lib/relay-host-portable/bootstrap.json
```

Copy the receipt to your administrator computer and verify it with the same
Relay version:

```bash
npx --yes --package "orionfold-relay@$RELAY_VERSION" \
  relay-host-playbook verify-bootstrap --receipt bootstrap.json
```

Success is `PORTABLE_BOOTSTRAP_PREPARED`. A VM can exist while bootstrap has
failed, so a provider's green status light is not enough. Named
`PORTABLE_SUBSTRATE_*`, `PORTABLE_BOOTSTRAP_*` or `PORTABLE_*_MISMATCH` errors
tell you what to repair. The detailed log is root-readable at
`/var/lib/relay-host-portable/bootstrap.log`; remove customer data before
sharing it with support.

To check a manually prepared machine before installation, run
`relay-host-playbook preflight`. It verifies the OS, architecture, CPU, memory,
disk, DNS, outbound HTTPS and clock against the same release manifest.

## 4. Activate protected access after bootstrap

Bootstrap intentionally does not start a public service or contain a license,
login password, ingress secret, model key or recovery key. Create those through
your authenticated SSH session.

Follow [Relay Host ingress and administrator access](./relay-host-access.md) to:

1. generate a high-entropy ingress token in a root-only environment file;
2. run Relay as the non-root `relay` user on `127.0.0.1:3000` with the
   `remote-authenticated` exposure profile;
3. place a TLS reverse proxy on ports 80/443 that supplies the ingress token;
4. create the single-use first-administrator credential; and
5. save the administrator recovery codes away from the VM.

The complete service and exact-digest Caddy example is in
[Run a Relay Host on DigitalOcean](./digitalocean-relay-host.md#3-put-relay-behind-authenticated-https).
Those Linux service steps are reusable; the DigitalOcean resource-creation and
cleanup instructions are not evidence that another provider is verified.

Copy the signed `product:relay-host` license over SSH and redeem it offline as
documented in [Relay Host fulfillment](./relay-host-fulfillment.md). Relay Core
and unmanaged single Cells remain free. The paid Host entitlement unlocks the
managed multi-Cell capacity shown in the signed license. A lapse stops new
managed capacity but never stops existing Cells or blocks export/recovery.

## 5. Initialize the Host and operate Cells

Use **Settings → Relay Host deployment → Local device**. The VM is the local
machine from Relay's perspective. Review the physical capacity, preflight and
install the Host. The Host controls only Cells resident on this one machine; it
is not a Fleet Controller for other servers.

The equivalent baseline CLI is:

```bash
relay host init \
  --host-root /srv/relay-host/supervisor \
  --license-dir /srv/relay-host/data/licenses \
  --host-id relay-portable-host \
  --cpu-millis 2000 \
  --memory-bytes 4294967296 \
  --storage-bytes 85899345920 \
  --reserve-percent 20
relay host inventory \
  --host-root /srv/relay-host/supervisor \
  --license-dir /srv/relay-host/data/licenses
```

Relay pins each Cell image by immutable digest and verifies its signature and
SLSA provenance. Do not replace a digest with a mutable tag or disable a
verification failure. Configure BYOK or a private Ollama, LM Studio or LiteLLM
runtime separately and test the exact private-network address from the Host.

## 6. Prove recovery before relying on the VM

Create the recovery key outside both Relay's data directory and the backup
destination. Create, verify and drill an encrypted recovery bundle using
[Relay Cell encrypted recovery](./relay-cell-recovery.md). Keep the key and a
verified bundle away from this VM and provider account.

A backup file alone is not proof. Periodically restore into an empty disposable
data root and verify administrator sign-in plus representative customer data.
Provider disk snapshots are useful additional protection but do not replace the
portable encrypted recovery proof.

## 7. Update, roll back and clean up

Before updating, create and verify an encrypted recovery bundle. Render the
new release's cloud-init only for a new VM; on an existing Host, install the new
exact npm release beside the old version, verify its package and Cell digest,
move the managed `/srv/relay-host/app` link, restart Relay, and run
`relay host reconcile`. Keep the previous accepted release until the update is
verified. Roll back by restoring that exact release and its accepted Cell
digest—never by moving a tag.

For teardown:

1. export or explicitly purge every managed Cell;
2. verify Host inventory contains nothing you need;
3. copy recovery bundles off the VM and verify the copies;
4. stop Relay and the reverse proxy, then remove their containers/volumes;
5. delete every VM, disk, address, firewall, DNS and snapshot resource in your
   provider worksheet; and
6. confirm the provider shows no remaining billable resource.

License lapse is never a reason to destroy an existing Cell. If cleanup cannot
reach zero, preserve the exact resource IDs and finish the provider-side rescue
before treating the environment as gone.

## Support boundary

The portable playbook supports the compatible-VM contract and checked Relay
assets above. It does not promise one-click provisioning, all-cloud support,
provider-managed backups, a Fleet Controller, hostile isolation from the
machine administrator, a hosted Orionfold service, an uptime SLA, an RPO/RTO,
or production local-model throughput on the minimum VM.

When asking for help, include the Relay version, Cell digest, named reason code,
redacted bootstrap/preflight receipt, `systemctl status relay-host` and
`relay host inventory`. Never send license contents, credentials, private keys,
model keys, recovery keys or customer data.
