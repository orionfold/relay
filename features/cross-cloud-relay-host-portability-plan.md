---
title: "Cross-cloud Relay Host portability implementation plan"
status: accepted
date: 2026-07-21
specification: features/cross-cloud-relay-host-portability.md
research: features/cross-cloud-relay-host-portability-research.md
---

# Cross-cloud Relay Host portability implementation plan

## Goal and accepted scope

Implement the accepted G-107 recommendation as independently releasable goals:

1. G-108 provider-neutral compatible-Linux-VM playbook.
2. G-109 verified AWS Lightsail profile.
3. G-110 verified Azure VM profile.
4. G-111 verified Google Compute Engine profile.
5. G-112 verified AWS EC2 enterprise profile.
6. G-113 trigger-gated lower-cost provider tranche.
7. G-086 aggregation of G-108, accepted DigitalOcean, G-109 and G-110 into the
   bounded Portable Host GA claim.

### Scope challenge

`PROCEED` was selected. `REDUCE` would postpone provider ordering and deliver
only the playbook research. `EXPAND` would add Marketplace images, a hosted
control plane, live provider proofs, or implementation inside G-107. Those are
not part of this planning goal. Existing G-085/G-105 artifacts are reused.

## NOT in scope

- No provider account, credentials, VM, disk, address, snapshot, spend or live
  mutation in G-107 or G-108 local implementation.
- No DigitalOcean Marketplace work; G-103 remains deferred.
- No Fleet Controller, hosted Orionfold control plane, remote credential
  custody, online entitlement service, shared tenant database, or `cloudMode`.
- No claim that all clouds, all regions, arm64 VMs, GPUs, Kubernetes, PaaS, or
  regulated workloads are supported.
- No mandatory OpenTofu dependency in the first portable release.
- No public Website copy, pricing, publish or release without its own gate.

## What already exists

| Existing surface | Reuse |
|---|---|
| `scripts/lib/digitalocean-g085.mjs` and related CLI/tests | source for provider effects, redaction, state and cleanup vocabulary |
| `scripts/digitalocean-g085.mjs` and live driver | source for stage/resume and customer-identical conformance |
| `docs/digitalocean-relay-host.md` | source for common customer steps and provider appendix separation |
| Host supervisor, entitlement and lifecycle APIs | unchanged common runtime contract |
| G-081 ingress and G-082 recovery | unchanged identity/recovery requirements |
| signed Cell release manifest and GHCR digest | unchanged artifact authority |
| `features/cloud-deploy-cost-inputs.json` and cost script | later dated multi-provider input schema; never runtime truth |

## Target architecture and file surfaces

```text
deploy/relay-host/
  manifest.schema.json
  cloud-init.yaml.tmpl
  README.md
scripts/lib/cloud-host/
  contract.mjs
  bootstrap-manifest.mjs
  preflight.mjs
  receipt.mjs
  providers/{digitalocean,lightsail,azure,gcp,ec2}.mjs
scripts/relay-host-linux-vm.mjs
docs/relay-host-linux-vm.md
docs/relay-host-{lightsail,azure,gcp,ec2}.md
```

G-108 may adjust exact names after code inspection, but must preserve this
ownership split. Provider tooling does not enter `src/lib/` in the playbook
release. Add `deploy/relay-host/` to the npm `files` allowlist and release
parity gates so the exact Host version carries its compatible templates and
manifest. Repository docs may link to those bytes; they are not a second copy.

## G-108 vertical slices — portable Linux VM playbook

### Slice 1: freeze the portable manifest and preflight

Files: new `deploy/relay-host/manifest.schema.json`,
`scripts/lib/cloud-host/contract.mjs`, targeted tests, package allowlist.

- Schema version, Relay version, Cell digest, installer checksum, Ubuntu/arch,
  CPU/memory/disk, ports, completion marker, log and receipt locations.
- Zod/JSON-schema boundary with named errors and redaction.
- Reject secrets and mutable/unversioned artifact references before rendering.

Verify: schema fixtures for valid minimum, missing/old Ubuntu, wrong arch,
insufficient resources, mutable tag, checksum mismatch, and every forbidden
secret input.

### Slice 2: idempotent secret-free bootstrap

Files: `deploy/relay-host/cloud-init.yaml.tmpl`, checked bootstrap installer,
renderer tests.

- Public inputs only; exact checksums and versions.
- Non-root Host runtime, private Cell/runtime ports, accepted firewall defaults.
- Re-run safely after partial install; marker only after every required check.
- Emit named failure, bounded log and redacted receipt.

Verify: golden rendering; shell/static checks; first run, identical retry,
partial-install rescue, unavailable artifact, wrong digest and disk-full fixture.

### Slice 3: local compatible-VM conformance

Files: `scripts/relay-host-linux-vm.mjs`, reusable proof extraction from G-085,
tests and receipt schema.

- Use a disposable local Ubuntu VM/container fixture without a cloud account.
- Run one/two-Cell admission, ingress, isolation, lifecycle, encrypted recovery,
  Host-loss restore, update/rollback/export and exact local cleanup.
- Receipt distinguishes substrate compatibility from provider verification.

Verify: deterministic fake/local proof plus a customer-identical installed npm
package. Runtime-registry imports, if touched, trigger a real task under
`npm run dev` per the project smoke rule.

### Slice 4: customer journey, packaging and browser evidence

Files: `docs/relay-host-linux-vm.md`, Settings help only if required,
`package.json`, package/public-boundary tests, `_ASSETS` sync after acceptance.

- Cloud-console-neutral numbered path: create VM, apply template, wait/check,
  activate protected secrets, open authenticated Host, operate, recover, clean.
- Explain portable versus verified provider and exact support limits.
- Browser verify linked settings/help and named failure guidance at desktop and
  390 px if UI changes; no UI change means deterministic doc/link/package proof.

Exit: operator approves portable wording and release. Website receives the
accepted receipt only then.

## Provider increment template (G-109–G-112)

Each provider goal owns one profile and does not reopen common behavior:

1. Refresh official capabilities, regional limits and price snapshot.
2. Add provider mapping/appendix and deterministic adapter fixtures.
3. Validate least-privilege identity, non-secret startup data, address/DNS/TLS,
   firewall, disk, snapshot/backup, inventory and cleanup.
4. With separate authorization, create one disposable customer-owned Host,
   install only public artifacts, and run the common one/two-Cell conformance.
5. Browser-walk first-admin and recovery/failure guidance.
6. Prove update/rollback/export, Host-loss restore and zero remaining billable
   resources; reconcile actual spend.
7. Record accepted/revise/no-go and hand only the earned named-provider claim
   to Website.

G-109 covers Lightsail only, not EC2. G-110 covers the selected Azure VM profile.
G-111 covers the selected GCE profile. G-112 covers EC2/VPC/IAM/EBS and may
reuse AWS identity concepts without inheriting Lightsail acceptance.

## G-113 trigger-gated tranche

Do not start until at least one trigger is recorded: qualified customer demand,
geography/compliance gap, or a measured supported-provider cost objection.
Refresh Hetzner and Akamai/Linode, choose one bounded first provider, then apply
the same provider increment template. If no trigger occurs, retaining the goal
costs nothing and makes no claim.

## G-086 GA aggregation

Start only after G-108, G-109 and G-110 are accepted. Consume the already
accepted DigitalOcean receipt plus those three receipts. Re-run cross-receipt
schema/artifact parity, normalize cost/operations/support differences, and
verify that no provider-specific branch entered Relay Core. The maximum claim
is “Portable Relay Host across the listed supported providers: DigitalOcean,
AWS Lightsail and Azure VM.” Website and release remain separately gated.

## Specification / acceptance mapping

| G-107 acceptance criterion | Durable evidence |
|---|---|
| compare both options | research “Options compared” |
| first playbook and provider order | research executive decision and matrix |
| common/provider split, no `cloudMode` | research boundary + this target architecture |
| explicit claim thresholds | research support taxonomy |
| credential/state/bootstrap/recovery/cleanup owners | research contract/risks + slices |
| regression plus live/browser budgets | this plan, G-108 slices and provider template |
| reconciled backlog/handoff/TDR | G-107 completion receipt and TDR-044 amendment |
| go/revise/no-go | accepted **GO** receipt |

## Regression-test budget

G-108 minimum automated budget:

- 12+ manifest/preflight cases across substrate, version, digest and secrets.
- 8+ bootstrap render/idempotency/partial-failure cases.
- 6+ receipt/redaction/completion-state cases.
- Package allowlist/tarball assertion for exact deploy assets and no secret data.
- Existing Host supervisor, ingress, recovery, OCI authority and cost-schema
  targeted suites unchanged.
- One disposable local Ubuntu-compatible customer-install proof.

Each provider goal adds:

- 10+ deterministic capability/schema/inventory/cleanup cases.
- one authorized live one/two-Cell run with recovery/rollback/export.
- one browser first-admin/failure journey if the documented setup changes UI.
- explicit zero-orphan inventory and actual cost receipt.

Broader verification before release: typecheck/lint/production build, npm pack
and public-boundary smoke, Host/Cell authority/knowledge gates, current docs/API
sync, and fresh-context architecture/security review.

## Error and Rescue Registry

| Failure | Detection | Customer-visible behavior | Rescue/rollback |
|---|---|---|---|
| unsupported machine | preflight before install | exact failed requirement | resize/reimage; no partial Host |
| corrupt/mutable bootstrap | checksum/version/digest guard | integrity failure | fetch exact release asset |
| cloud-init reports late/fails | completion marker + log check | “VM exists; Relay not ready” | idempotent checked retry |
| secret supplied in user-data | renderer/schema rejection | forbidden field named without value | protected activation path |
| partial Host install | observed-state reconciliation | partial receipt, no ready marker | resume or scoped uninstall |
| ingress/auth incomplete | conformance refuses exposure | named DNS/TLS/auth step | keep ports private; retry |
| recovery proof fails | restore/hash/lineage assertion | no durability/support claim | preserve encrypted export and repair mapping |
| provider API partial failure | labeled inventory comparison | surviving resources listed | scoped cleanup; never delete unlabeled resources |
| cleanup cannot reach zero | final inventory/spend check | goal remains unaccepted | operator-visible manual rescue |
| common boundary requires Core branch | architecture diff review | implementation stops | narrow/reject provider profile |

## Operator gates

- Approve portable and provider-specific support wording.
- For every live provider run: account, credential, role, region, quota, spend
  ceiling, resource creation and teardown.
- Any OpenTofu state backend or retained credential design.
- Public docs/pricing, Website work, push, publish, tag, release or support SLA.

Local planning, deterministic tests and a local disposable fixture need no
cloud authorization. After two materially different failures at the same
boundary, stop with the receipt and narrow the provider/profile rather than
weakening TDR-044.
