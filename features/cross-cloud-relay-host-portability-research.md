---
title: "G-107 research — Cross-cloud Relay Host portability"
status: accepted
date: 2026-07-21
decision: go
baseline: accepted G-085/G-105 DigitalOcean Host evidence
---

# Cross-cloud Relay Host portability research

## Executive decision

**GO**, in two bounded stages:

1. Ship a provider-neutral **compatible Linux VM playbook** before adding another
   cloud API. A customer creates an Ubuntu VM in an account they own, applies a
   versioned secret-free bootstrap, completes protected first-admin setup, and
   runs a local conformance check. No cloud credential is retained by Relay.
2. Add **verified provider profiles** independently in this order: AWS
   Lightsail, Azure Virtual Machines, Google Compute Engine, and then AWS EC2.
   A lower-cost provider tranche is demand-triggered, with Hetzner first and
   Akamai/Linode as the comparison/fallback.

The first playbook does not require OpenTofu. Optional OpenTofu modules may be
added after the manual contract is accepted, but state and credentials remain
customer-owned. DigitalOcean Marketplace G-103 stays deferred because it is a
distribution channel, not a portability prerequisite.

The safe first promise is: **Relay Host can run on a compatible customer-owned
Ubuntu VM using the portable playbook. DigitalOcean is currently the only
provider verified end to end.** Each additional provider is named only after
its own live acceptance receipt.

## Evidence method

Research was refreshed on 2026-07-21 from official cloud-init, OpenTofu, and
provider documentation. Provider prices are planning snapshots, not quotes.
Prices vary by region, currency, tax, IPv4, storage, transfer, and discounts;
implementation goals must refresh their exact region and timestamp before
spend or public comparison copy.

The accepted DigitalOcean proof is the control: Ubuntu 24.04 x64, 2 vCPU,
4 GiB memory, 80 GiB disk, authenticated ingress, digest-pinned Cell OCI,
encrypted recovery, lifecycle/rollback/export, and exact cleanup.

## Options compared

| Option | Customer value | Build/support cost | Security and portability truth | Decision |
|---|---|---|---|---|
| Provider-neutral playbook first | useful on any compatible VM; no provider API expertise required | one common bootstrap/preflight/docs surface | strongest credential boundary; compatibility is not mislabeled as provider support | **ship first** |
| OpenTofu required for v1 | repeatable provisioning for infrastructure teams | provider modules, state lifecycle, version locks and destroy semantics immediately | state may contain sensitive infrastructure data; raises the entry barrier | reject as a requirement; optional later |
| Provider adapters first | smoother one-provider setup | repeats provisioning work before common contract stabilizes | earns a named-provider claim, not general portability | ship incrementally after playbook |
| Marketplace images first | provider-native discovery | image pipeline, vendor review, listing/support and fulfillment decisions | channel-specific; can obscure what Relay versus provider supplies | keep G-103 deferred |
| Hosted Orionfold control plane | centralized multi-cloud orchestration | new online auth, secret custody, tenancy, availability and billing service | conflicts with customer-owned/offline v1 boundary | reject for this train |

## Accepted portable substrate contract

The first playbook supports one customer-owned machine matching all of these
conditions:

- Ubuntu Server 24.04 LTS, x86_64 first; arm64 support only after a complete
  live conformance receipt on that architecture.
- Minimum accepted proof profile: 2 vCPU, 4 GiB RAM, 80 GiB persistent local
  block storage, stable DNS, accurate system clock, outbound HTTPS, and enough
  provider quota for the requested public address/firewall/storage resources.
- Docker Engine compatible with the signed multi-architecture Cell image;
  Node/npm compatible with the exact Relay Host release manifest.
- One public HTTPS entrance through Relay's accepted authenticated ingress.
  SSH is operator-scoped; Cell, database, Docker, and local-model ports remain
  private.
- Host-local operational SQLite/WAL and files. Provider snapshots are an
  additional crash-consistent recovery aid, not a replacement for Relay's
  encrypted application-level export/restore contract.
- Customer-owned provider account, bill, DNS, VM, disks, snapshots, backups,
  credentials, and teardown. Orionfold owns Relay artifacts and support truth;
  Website owns public offer/copy only after a Relay receipt.

The playbook has two phases:

1. **Secret-free first boot.** Cloud-init may carry only the public operator SSH
   key, exact Relay version/bootstrap URL, checksum/digest, and non-secret
   placement labels. It must not contain a Relay license, admin password,
   ingress token, model/API key, recovery key, provider token, or customer data.
2. **Protected activation.** After `cloud-init status --wait` and a Relay marker
   confirm bootstrap completion, the customer supplies license and secrets
   through the authenticated/local setup path, then runs preflight and
   conformance. “VM running” never means “Relay ready.”

cloud-init is the common bootstrap envelope because its official datasource
catalog includes AWS EC2, Azure, DigitalOcean, Google Compute Engine and Akamai,
and it can normally identify the platform. Its own documentation also says
processed metadata is inspectable, which is why the payload is secret-free.

## Common versus provider-specific boundary

| Common Relay contract | Provider profile owns |
|---|---|
| release manifest, npm Host and signed digest-pinned Cell image | VM/image/architecture selection |
| Ubuntu/runtime/substrate preflight | address, DNS and provider firewall mapping |
| idempotent bootstrap and completion marker | cloud-init/startup-data limit and log path |
| first-admin/authenticated HTTPS | identity/role and least-privilege provider setup |
| Host/Cell admission, isolation and lifecycle | block volume and snapshot primitives |
| encrypted export/restore, update/rollback | provider backup/restore instructions |
| redacted receipt schema and named failures | inventory, cost and zero-orphan cleanup |

Implementation should extract the reusable proof logic from the existing
DigitalOcean scripts into `scripts/lib/cloud-host/`. Provider code remains in
CLI tooling under `scripts/lib/cloud-host/providers/`; it does not enter Relay
Core or `src/lib/host/supervisor/provider.ts`. The portable first release does
not create provider resources at all.

## Bootstrap and IaC decision

- Publish a versioned cloud-init template plus a checked installer and a
  provider-neutral preflight/conformance command.
- Pin Relay version, Cell digest, installer checksum, Node/runtime compatibility
  and template schema in one release manifest. Do not curl an unversioned branch
  or mutable `latest` artifact as root.
- Installer retries are idempotent and end in one of `ready`, `failed`, or
  `rescue-required`; they write a redacted local receipt and stable diagnostic
  log location.
- Distribute same-version playbook assets with Relay's release surface (npm
  package and repository/release docs) so a customer cannot accidentally pair
  an old bootstrap with a new Host. A manifest checksum detects drift.
- OpenTofu is optional. If later shipped, provider configurations stay in the
  root module, credentials use environment/instance profiles, provider versions
  are locked, and state remains customer-controlled. Relay never uploads or
  operates a default remote state backend.

## Weighted provider matrix

Scores are 1 (weak) to 5 (strong). Weights: observed/expected customer fit 20;
self-serve and price clarity 15; substrate fit 10; bootstrap observability 10;
network/identity 10; storage/recovery 10; automation 10; geography/enterprise
5; support burden 5; disposable proof cost/cleanup 5. Customer-fit scores are
product hypotheses pending actual demand data, not third-party market facts.

| Provider/profile | Fit | Simple cost | Substrate | Bootstrap | Network | Recovery | Automation | Reach | Support | Proof | Weighted / 5 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DigitalOcean baseline | 4 | 5 | 5 | 5 | 4 | 4 | 5 | 4 | 5 | 5 | **4.55** |
| AWS Lightsail | 5 | 5 | 5 | 4 | 3 | 4 | 4 | 4 | 4 | 4 | **4.35** |
| Azure VM | 5 | 2 | 5 | 3 | 5 | 5 | 5 | 5 | 2 | 2 | **4.05** |
| AWS EC2 | 5 | 2 | 5 | 4 | 5 | 5 | 5 | 5 | 2 | 2 | **4.15** |
| Google Compute Engine | 3 | 3 | 5 | 4 | 5 | 5 | 5 | 5 | 3 | 3 | **4.00** |
| Hetzner Cloud | 2 | 5 | 5 | 4 | 4 | 3 | 4 | 3 | 4 | 5 | **3.75** |
| Akamai/Linode | 2 | 4 | 5 | 4 | 4 | 3 | 4 | 4 | 4 | 4 | **3.60** |

The raw score places EC2 above Azure, but the release order deliberately moves
Azure ahead to prove a second provider company rather than spending two
consecutive increments inside AWS. That is a product-strategy override, stated
openly rather than hidden in the scoring. GCP follows. EC2 remains a distinct
later enterprise profile; a Lightsail receipt must never be described as EC2
support. Actual qualified-customer demand may reorder G-110–G-112 before spend.

## Provider findings and cost snapshots

### DigitalOcean — accepted reference

The official Droplet price snapshot for the accepted 2 vCPU/4 GiB/80 GiB
profile is $0.03571/hour capped at $24/month. G-085/G-105 already proved the
journey and cleanup; no new provider work is required for G-107.

### AWS Lightsail — first verified increment

Lightsail is the closest hyperscaler analogue to DigitalOcean: bundled compute,
SSD, transfer, a static IP, DNS, snapshots and a predictable monthly ceiling.
The official Linux Medium public-IPv4 bundle is 2 vCPU, 4 GB RAM, 80 GB SSD,
4 TB transfer and $24/month with hourly metering capped monthly. This gives the
fastest path to a second supported provider without pretending the broader EC2
VPC/IAM surface is covered.

### Azure Virtual Machines — second increment

Azure custom data has a 64 KB limit and Microsoft warns against placing
sensitive values in it. Azure may report the VM ready before cloud-init has
finished, and cloud-init failure may not make provisioning fail. The Relay
completion marker and diagnostic receipt are therefore mandatory. Compute,
managed disk, public IP and transfer prices are separate and regional; the
implementation goal must stamp an Azure Calculator configuration rather than a
single evergreen price.

### Google Compute Engine — third increment

GCE startup scripts are metadata-driven and expose serial/guest-agent logs.
The 2026-07-21 official general-purpose table lists `e2-medium` in us-central1
at $0.03350571/hour for 2 vCPU/4 GiB—about $24.46 for 730 hours before disk,
IPv4 and network charges. The profile must add those separate resources and
prove snapshot restore plus complete cleanup.

### AWS EC2 — later enterprise AWS profile

EC2 supplies the most flexible IAM/VPC/security-group/EBS surface but has more
choices and separately metered resources than Lightsail. User data is
retrievable, runs as root on first boot by default, and has a raw 16 KB limit;
its output and completion must be checked. EC2 gets its own goal after provider
diversity is established.

### Lower-cost tranche

Hetzner provides cloud-init, firewalls, primary IPs, block volumes and hourly
billing capped monthly. Its volumes are not included in server snapshots or
backups, so the recovery mapping needs explicit independent handling.
Akamai/Linode supplies user-data/cloud-init, cloud firewalls, block storage and
backups, but block storage is not covered by the instance backup service.
These providers can improve economics/geography but enter the committed train
only when demand or cost evidence activates the tranche.

## Support taxonomy and evidence thresholds

| Label | Evidence required | Safe customer meaning |
|---|---|---|
| Portable playbook | compatible-VM contract, deterministic bootstrap/preflight tests, local disposable Linux VM proof, docs/package parity | customer can apply the common contract to a compatible VM; unlisted provider mapping is customer responsibility |
| Verified provider | all portable evidence plus provider mapping, authorized live customer-identical run, browser setup, recovery/rollback and zero-orphan cleanup | Relay supports the exact named provider/profile and documented limits |
| Portable Host GA | portable playbook plus accepted DigitalOcean, AWS Lightsail and Azure VM receipts aggregated by G-086 | Relay is portable across the specifically listed supported providers; not every cloud/profile |
| Marketplace/one-click | provider review/listing/image and fulfillment/support acceptance | provider-native acquisition channel; does not broaden runtime support by itself |

GCP, EC2 and lower-cost providers may release after GA as independent coverage
increments. This threshold is intentionally provider-company diverse and
bounded: common playbook + three accepted providers (DigitalOcean, AWS
Lightsail, Azure VM). Any public phrase such as “works on any cloud” remains
prohibited.

## Risks, failure names and rescue

| Risk/failure | Required behavior | Rescue |
|---|---|---|
| `UnsupportedSubstrateError` | refuse before mutation with failed checks | resize/reimage or use a verified profile |
| `BootstrapIntegrityError` | stop on version/checksum/digest mismatch | use exact signed release assets |
| `BootstrapIncompleteError` | VM may stay running, but Relay is not marked ready | show cloud-init/installer log and idempotent retry |
| `SecretInUserDataError` | validation rejects known secret fields/patterns | move secret to protected activation |
| `IngressPreflightError` | do not expose a Cell or model port | repair DNS/TLS/firewall/auth mapping |
| `RecoveryConformanceError` | no durability/support claim | keep encrypted export path; repair provider snapshot mapping |
| `ProviderCleanupIncompleteError` | list exact surviving billable resources | preserve receipt and retry scoped cleanup |
| provider contract cannot fit common boundary | stop after two approaches | narrow provider/profile; never add `cloudMode` to Core |

## Official sources

- [cloud-init datasources](https://docs.cloud-init.io/en/latest/reference/datasources.html)
- [OpenTofu provider configuration](https://opentofu.org/docs/language/providers/configuration/)
- [OpenTofu backend configuration](https://opentofu.org/docs/language/settings/backends/configuration/)
- [AWS Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html)
- [AWS Lightsail overview](https://docs.aws.amazon.com/lightsail/latest/userguide/what-is-amazon-lightsail.html)
- [AWS EC2 user data](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)
- [AWS EBS snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html)
- [Azure custom data and cloud-init](https://learn.microsoft.com/en-us/azure/virtual-machines/custom-data)
- [Azure VM user data](https://learn.microsoft.com/en-us/azure/virtual-machines/user-data)
- [Azure managed disks](https://learn.microsoft.com/en-us/azure/virtual-machines/managed-disks-overview)
- [Google Compute Engine startup scripts](https://cloud.google.com/compute/docs/instances/startup-scripts/linux)
- [Google Compute Engine pricing](https://cloud.google.com/products/compute/pricing/general-purpose)
- [Google disk snapshot practices](https://cloud.google.com/compute/docs/disks/snapshot-best-practices)
- [Hetzner server creation/cloud-init](https://docs.hetzner.com/cloud/servers/getting-started/creating-a-server/)
- [Hetzner volumes](https://docs.hetzner.com/cloud/volumes/overview/)
- [Akamai user data](https://techdocs.akamai.com/cloud-computing/docs/add-user-data-when-deploying-a-compute-instance)
- [Akamai block storage](https://techdocs.akamai.com/cloud-computing/docs/block-storage)
