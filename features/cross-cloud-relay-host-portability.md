---
title: "G-107 — Research and plan cross-cloud Relay Host portability"
status: completed
priority: P1
milestone: post-mvp
source: operator request 2026-07-21; accepted G-085/G-105 DigitalOcean evidence; official provider documentation
dependencies:
  - guided-digitalocean-beta
  - licensed-self-service-cloud-deploy
informs:
  - digitalocean-marketplace-relay-host
  - relay-host-portability-conformance
---

# G-107 — Research and plan cross-cloud Relay Host portability

## Accepted decision — 2026-07-21

**GO.** Release G-108's provider-neutral compatible-Linux-VM playbook first,
without mandatory IaC or Relay custody of provider credentials. Then verify AWS
Lightsail (G-109), Azure VM (G-110), GCP (G-111), and AWS EC2 (G-112) as
independent profiles. Keep the lower-cost Hetzner/Akamai tranche G-113
trigger-gated and DigitalOcean Marketplace G-103 deferred.

The weighted evidence, dated provider/cost findings, common substrate contract,
support taxonomy and safe promise are in
`features/cross-cloud-relay-host-portability-research.md`. The codebase-grounded
vertical-slice and regression/rescue plan is in
`features/cross-cloud-relay-host-portability-plan.md`.

Portable Host GA (G-086) now requires the accepted G-108 playbook plus accepted
DigitalOcean, AWS Lightsail and Azure VM receipts. GCP and EC2 expand named
coverage afterward; no phrase such as “any cloud” is authorized.

## Outcome

Produce an authoritative, implementation-ready recommendation for carrying the
accepted DigitalOcean Relay Host work to other customer-owned Linux VM clouds
without turning Relay into a hosted PaaS or creating provider branches in Relay
Core.

The recommendation must sequence two independently valuable options:

1. **Release a cross-cloud portable playbook first.** Give a customer a
   provider-neutral, self-serve way to create a compatible Linux VM in a cloud
   account they own and apply the same Relay Host contract already proven on
   DigitalOcean.
2. **Add verified providers incrementally.** Rank AWS, Azure, GCP, and
   appropriate lower-cost alternatives, then define bounded provider releases
   whose support claims are earned by real conformance evidence.

This is a research, architecture, and planning goal. It does not provision a
cloud resource, spend money, consume a customer credential, claim support for
an untested provider, or implement a Marketplace listing.

## Why this is the next cloud increment

G-085/G-105 proved one customer-owned DigitalOcean Host end to end. Most of
that journey is already provider-neutral: Ubuntu, the npm-delivered Host,
digest-pinned signed Cell OCI, authenticated ingress, Host/Cell admission,
recovery, lifecycle receipts, and exact cleanup. The provider-specific work is
primarily VM, network/firewall, static-address, storage, bootstrap, inventory,
and teardown mapping.

DigitalOcean Marketplace G-103 is therefore deferred, not deleted. A portable
playbook creates customer value across clouds before Relay invests in another
provider-specific acquisition channel. Marketplace research can resume later
without changing the Host/Cell product boundary.

## Decision framing

### Option 1 — Provider-neutral portable playbook first

Research and specify a truthful **compatible Linux VM** deployment contract.
The first release should be useful on an ordinary customer-created VM but must
not say every cloud is officially supported.

The research must decide and document:

- the minimum supported substrate: Ubuntu LTS version, architecture, CPU,
  memory, disk, filesystem, outbound network, container runtime, Node/npm,
  clock/DNS, and required kernel/runtime controls;
- one versioned, idempotent, secret-free bootstrap mechanism, comparing
  cloud-init plus a checked installer with a plain interactive installer;
- which inputs are safe in cloud user-data and which must be supplied only
  after first boot through a protected channel;
- the portable mappings for HTTPS/DNS, first-admin bootstrap, host and provider
  firewalls, static addresses, recovery storage, backups, restore, upgrades,
  rollback, inventory, and teardown;
- a provider capability worksheet that lets a customer map those primitives in
  an unverified cloud without confusing compatibility with Relay support;
- a preflight/conformance command and redacted receipt that prove bootstrap
  completion, artifact authority, ingress, isolation, capacity, recovery, and
  zero-orphan cleanup; and
- the customer-facing support vocabulary for “portable playbook,” “verified
  provider,” and a later “Marketplace/one-click” channel.

The default hypothesis is a downloadable provider-neutral playbook and
bootstrap asset that does **not** require infrastructure-as-code expertise.
Compare an optional OpenTofu module family for repeatability, but do not make
OpenTofu, Terraform, or retained Relay access to a cloud account a prerequisite
for the first customer self-serve release.

### Option 2 — Prioritized verified-provider increments

Score providers with a dated, evidence-linked matrix instead of selecting only
by market size. At minimum compare:

- AWS, explicitly separating the simpler Lightsail journey from the broader
  EC2/IAM/VPC enterprise journey;
- Microsoft Azure Virtual Machines;
- Google Compute Engine;
- DigitalOcean as the accepted baseline; and
- at least two credible lower-cost VM providers, initially Hetzner Cloud and
  Akamai/Linode unless current evidence recommends alternatives.

The matrix must weight:

1. Relay customer and ICP demand;
2. self-serve setup simplicity and predictable cost;
3. Ubuntu/image and CPU-architecture fit;
4. cloud-init or startup-script behavior and completion observability;
5. public/static IP, DNS/TLS, firewall, private-network, and bastion choices;
6. persistent disk, snapshot, backup, export, and recovery fit;
7. identity, credential, secret, and least-privilege boundaries;
8. API, CLI, OpenTofu/provider, inventory, and cleanup maturity;
9. geography, compliance posture, support burden, and failure modes; and
10. the cost and evidence needed for a disposable real-provider conformance run.

The starting hypothesis to challenge is AWS first, Azure second, and GCP third,
with AWS Lightsail versus EC2 decided explicitly rather than hidden inside the
AWS label. Lower-cost providers should be ranked for a later portability/
economics tranche, not promised automatically.

Each recommended provider increment must be independently releasable and own:

- a provider adapter or provider-specific appendix over the common contract;
- deterministic fake-provider and schema/policy regressions;
- an authorized, customer-identical disposable live run;
- browser onboarding and named failure evidence;
- backup/restore, update/rollback, and provider-inventory cleanup; and
- a dated support/claim receipt handed to Website only after acceptance.

## Proposed architecture boundary to validate

```text
Relay Host portable contract
  ├─ version/digest-pinned Relay installer and secret-free bootstrap
  ├─ substrate preflight + redacted conformance receipt
  ├─ Host/Cell, ingress, recovery, update and cleanup contracts
  └─ provider capability interface
       ├─ DigitalOcean mapping (accepted baseline)
       ├─ AWS mapping (Lightsail and/or EC2)
       ├─ Azure VM mapping
       ├─ Google Compute Engine mapping
       └─ later low-cost provider mappings
```

Relay Core, the Host supervisor, Cell format, entitlement, recovery manifest,
and lifecycle receipt remain unchanged across providers. Provider modules own
only infrastructure creation/discovery/deletion and mapping of network,
address, disk, bootstrap, identity, and backup primitives. Long-lived provider
credentials remain in the customer's provider tooling; they are neither baked
into user-data nor retained by Relay.

## Security and failure requirements

- Treat cloud user-data and instance metadata as observable, persistent inputs;
  never place the Relay license, model API keys, backup keys, admin secrets, or
  long-lived provider credentials in them.
- Do not equate “VM created” with “bootstrap succeeded.” Require a bounded,
  queryable completion signal and actionable logs because several providers
  return provisioning success before cloud-init/startup work completes.
- Default to authenticated HTTPS only. SSH, when used, is explicitly scoped;
  Cell, Docker, database, and local-model ports stay private.
- Inventory and cleanup include chargeable static addresses, disks/snapshots,
  firewalls, keys, and temporary credentials—not just the VM.
- Recovery evidence must address application-consistent versus crash-consistent
  snapshots and preserve the accepted encrypted export/restore path.
- A provider failure must produce a named failure and redacted rescue receipt;
  never silently continue with a partial Host or broaden the security claim.

## Research sources to refresh at execution

Use current primary/official sources only. The grooming baseline includes:

- [cloud-init datasource reference](https://cloudinit.readthedocs.io/en/latest/reference/datasources.html)
- [OpenTofu provider configuration](https://opentofu.org/docs/language/providers/configuration/)
- [AWS EC2 user data and cloud-init](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)
- [AWS Lightsail product model](https://docs.aws.amazon.com/lightsail/latest/userguide/what-is-amazon-lightsail.html)
- [AWS EC2 security-group rules](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/security-group-rules-reference.html)
- [AWS EBS snapshots](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html)
- [Azure custom data and cloud-init](https://learn.microsoft.com/en-us/azure/virtual-machines/custom-data)
- [Azure VM user data security behavior](https://learn.microsoft.com/en-us/azure/virtual-machines/user-data)
- [Azure managed disks](https://learn.microsoft.com/en-us/azure/virtual-machines/managed-disks-overview)
- [Google Compute Engine startup scripts](https://cloud.google.com/compute/docs/instances/startup-scripts/linux)
- [Google Compute Engine static external IPs](https://cloud.google.com/compute/docs/ip-addresses/configure-static-external-ip-address)
- [Google Compute Engine disk snapshots](https://cloud.google.com/compute/docs/disks/create-snapshots)
- [Hetzner Cloud server overview](https://docs.hetzner.com/cloud/servers/overview/)
- [Akamai Cloud firewall](https://techdocs.akamai.com/cloud-computing/docs/create-a-cloud-firewall)

At execution, record access dates, current pricing inputs, regional constraints,
and any ambiguous provider requirement. An ambiguity becomes an explicit open
question, not an inferred support claim.

## Deliverables

G-107 produces:

1. a dated provider-neutral substrate and capability contract grounded in the
   accepted DigitalOcean implementation;
2. an architecture decision on bootstrap format and optional IaC, including
   secret, state, version-pinning, update, rollback, and rescue boundaries;
3. a customer-journey and support-claim specification for the portable
   playbook first release;
4. a weighted provider matrix and recommended release order, including the
   explicit AWS Lightsail-versus-EC2 decision;
5. a codebase gap/blast-radius audit identifying reusable and provider-specific
   surfaces;
6. a vertical-slice implementation plan with a regression budget, broader
   verification, customer-identical live proof, cleanup, and rollback;
7. bounded implementation Goal Contracts for the portable-playbook release and
   each approved initial provider increment; and
8. an amendment recommendation for G-086 so Portable Host GA is earned by the
   new evidence sequence rather than a vague second-target trigger.

## Acceptance criteria

- Both options are compared on customer value, implementation cost, security,
  portability truth, support burden, and time to a useful release.
- The recommendation identifies one first portable-playbook release and an
  incremental provider order; it does not collapse research and implementation
  into a single unbounded goal.
- Common Relay behavior is separated from provider infrastructure behavior with
  named interfaces, exact source surfaces, and no proposed `cloudMode` branch.
- Portable, verified-provider, and Marketplace claims have explicit evidence
  thresholds and Website handoff points.
- Provider credentials, license secrets, infrastructure state, bootstrap
  completion, backups, cleanup, and spend gates have named owners and failure
  paths.
- The plan includes deterministic regression tests and budgets real provider
  and browser evidence only for the provider implementation goals.
- `_IDEAS/backlog.md`, `_IDEAS/host-cell-fulfill.md`, the durable cloud plan,
  and any affected TDR recommendation are reconciled with the approved release
  sequence.
- The final receipt is one of **go**, **revise**, or **no-go**, with the safe
  customer promise and separately gated next operations stated plainly.

## Operator gates

- Approving the provider order and support/GA wording.
- Any cloud account, credential, organization/role, paid VM/disk/IP/snapshot,
  quota, or provider mutation.
- Any external OpenTofu/Terraform state backend or retained credential flow.
- Website copy, pricing, checkout, public documentation, support commitment,
  push, publish, release, Marketplace enrollment, or listing.

Read-only research and local planning need no provider authorization.

## Stop and rescue

Stop after two materially different research paths fail to resolve the same
provider requirement, or if the common contract would require weakening
TDR-044's Host/Cell, auth, recovery, offline-license, or customer-ownership
boundaries. Preserve the matrix and unresolved question, recommend a narrower
provider or manual-playbook tranche, and do not represent unverified clouds as
supported.

## Completion receipt

| Acceptance criterion | Result |
|---|---|
| compare playbook-first and provider-first paths | passed; playbook-first selected |
| identify bounded first release and provider order | passed; G-108 → G-109 → G-110 → G-111 → G-112 |
| separate common and provider behavior | passed; provider effects stay in deployment CLI/tooling, not Relay Core |
| define claim thresholds and Website handoffs | passed; portable, verified and Marketplace labels are distinct |
| name secret/state/bootstrap/recovery/cleanup ownership | passed; customer retains provider authority and state |
| budget deterministic/live/browser evidence | passed; exact budgets are in the implementation plan |
| reconcile train, fulfillment authority and TDR | passed; G-086 threshold and child goals are explicit |
| return go/revise/no-go | **GO** |

No provider account, credential, infrastructure, spend, external state,
Website mutation, public claim, push, publish or release occurred in G-107.
