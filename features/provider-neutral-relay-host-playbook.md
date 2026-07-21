---
title: "Provider-neutral Relay Host Linux VM playbook"
status: completed
goal: G-108
date: 2026-07-21
decision: features/cross-cloud-relay-host-portability.md
plan: features/cross-cloud-relay-host-portability-plan.md
architecture: features/tdr/TDR-044-customer-owned-host-substrate-contract.md
---

# Provider-neutral Relay Host Linux VM playbook

## Outcome

A customer can prepare an ordinary compatible Linux VM for Relay Host without
giving Relay persistent access to the customer's cloud account. The exact Relay
release carries a secret-free cloud-init template, checked bootstrap, manifest,
preflight/receipt verifier and customer guide in its npm package.

This earns the label **portable playbook**. It does not earn a claim that every
cloud is supported or that a provider has been verified. Named-provider support
requires its own disposable customer-identical conformance receipt.

## Supported substrate

- Ubuntu 24.04 LTS, x86_64
- at least 2 vCPU, 4 GiB RAM and 80 GiB disk
- working DNS, outbound HTTPS and synchronized system time
- a customer-owned public SSH key
- inbound SSH restricted to the customer's administrator address

The customer owns the VM, cloud account, bill, network, DNS, backup destination
and provider credentials. Relay receives none of those credentials.

## Artifact authority

`deploy/relay-host/portable-manifest.json` is the same-version contract. It pins:

- the exact `orionfold-relay` version;
- the exact signed Relay Cell image digest;
- the Node and Cosign versions and upstream SHA-256 checksums;
- the checked bootstrap checksum;
- the compatible substrate and managed filesystem paths.

The renderer refuses a manifest that differs from `package.json`, the canonical
Cell release authority or the bootstrap bytes. Cloud user-data contains only
the release contract, one public SSH key and a non-secret hostname.

## Security boundary

Cloud user-data must never contain a Relay license, password, token, model/API
key, recovery key, private key, provider credential or customer data. The
renderer accepts only `sshPublicKey` and `hostname`, rejects secret-bearing
fields and secret-like values, and names the refusal without printing the
secret. Protected activation happens after bootstrap over the administrator's
authenticated SSH session.

Bootstrap does not expose Relay publicly. It prepares the exact Relay package,
verifies the Cell signature and SLSA provenance, separates the passwordless-sudo
`relayadmin` SSH operator from the locked non-sudo `relay` runtime identity,
creates managed paths, then writes a mode-0600 completion receipt.
Ingress, TLS, first-admin credentials, the Host license, model credentials and
recovery secrets remain explicit post-bootstrap steps.

## Commands

The npm package exposes `relay-host-playbook`:

- `manifest` prints the same-version contract;
- `render` produces mode-0600 secret-free cloud-init;
- `preflight` evaluates the current machine or a deterministic facts fixture;
- `verify-bootstrap` verifies the VM receipt against the same release.

Failures use stable `PORTABLE_*` reason codes. Receipt and diagnostic output is
redacted. A cloud console saying that the VM is running is not completion
evidence; `cloud-init status --wait` plus the verified Relay receipt is.

## Idempotence and rescue

An identical bootstrap retry is safe. Existing versioned release bytes are
reused, and the active app path may only point to the same release. If another
release or unmanaged directory is active, bootstrap stops with a named conflict
instead of overwriting it. Failed bootstrap writes a failure receipt and log;
the customer repairs the named substrate or artifact issue and reruns the same
checked bootstrap.

Updates install a new exact release beside the old one, verify it, change the
managed active link and retain the previous release for rollback. Rollback and
recovery never depend on the cloud provider API. Teardown begins with encrypted
Cell/Host export, stops the service, removes Relay data only after explicit
confirmation, then uses the provider console to remove every billable resource.

## Acceptance criteria

| ID | Criterion | Verification |
|---|---|---|
| AC-1 | Same-version manifest pins Relay, Cell, tools and bootstrap | manifest contract tests and package parity |
| AC-2 | Renderer accepts only public inputs and refuses secret classes | secret fixtures and golden render tests |
| AC-3 | Preflight enforces the compatible substrate with named failures | deterministic fact fixtures |
| AC-4 | Bootstrap is checked, non-root at runtime, idempotent and receipt-driven | shell inspection, dry-run retry in Ubuntu 24.04 fixture |
| AC-5 | Cell provenance is verified before completion | bootstrap assertions and existing Cell authority gates |
| AC-6 | npm tarball carries the exact playbook assets and CLI | allowlist test and `npm pack --dry-run` |
| AC-7 | Customer guide covers prepare, wait, activate, operate, recover, update, rollback, export and cleanup | deterministic doc/link review |
| AC-8 | Existing Host lifecycle, ingress, recovery and fulfillment remain green | targeted Host suites and broader release gates |
| AC-9 | Website receives customer-friendly portable-playbook copy without an unearned provider claim | Website handoff document and canonical contract update |

## Non-goals

- creating or deleting a provider VM, firewall, address, DNS record or snapshot;
- retaining AWS, Azure, GCP, DigitalOcean or other provider credentials;
- mandatory Terraform/OpenTofu, Kubernetes, PaaS or hosted Fleet control;
- arm64, GPU, regulated-workload, “all cloud” or “one-click” claims;
- changing Relay Core, Host/Cell entitlements or public application UI.

## Completion receipt

Accepted for Relay `v0.45.1` on 2026-07-21.

| Acceptance | Evidence | Result |
|---|---|---|
| AC-1/AC-2/AC-3 | 51 manifest, checksum, secret, render, preflight, receipt, account-separation and package tests | pass |
| AC-4 | `bash -n`; x86_64 Ubuntu 24.04 Docker fixture emits named insufficient-disk receipt, then passes two identical no-mutation retries | pass |
| AC-5/AC-8 | 20 artifact-policy tests plus 136 Host/ingress/entitlement/recovery tests; release-authority and fulfillment gates | pass |
| AC-6 | npm dry-run tarball includes all seven required surfaces; 1,385 files, 2,934,365 compressed bytes | pass |
| AC-7/AC-9 | packaged customer guide, README entry, 566-file local-link gate, Website customer-copy handoff | pass |
| broader release guard | CLI build, production Next build, public-boundary/knowledge gates | pass; existing unrelated Turbopack trace warnings remain |
| full Host journey | accepted G-105 public `0.44.9` DigitalOcean receipt covers one/ten-Cell admission, isolation, ingress, private runtime, encrypted recovery, restart, rollback, export and zero-orphan cleanup using this manifest's exact Relay/Cell authority | reused; no new provider mutation or spend |
| UI/browser disposition | no application UI changed | not applicable; deterministic docs/package/runtime evidence used |
| fresh architecture/security review | two critical findings fixed: deliberate failure receipts and SSH/runtime identity separation | APPROVE; no open findings |

Relay Cell `v0.45.1` is public and verified at
`sha256:4dd8a80652a6b83ae7c413646db48eb4e532dd06aa04a2a7c8bc393a8fac1149`.
The provider-neutral playbook is included in the matching npm/GitHub release;
Website adaptation/publication and any named-provider proof remain separately
operator-gated.
