---
title: Guided DigitalOcean Relay Host beta
status: in-progress
priority: P0
milestone: post-mvp
source: features/digitalocean-relay-host-conformance.md
dependencies: [digitalocean-relay-host-conformance]
---

# Guided DigitalOcean Relay Host beta

## Description

Turn the accepted G-085 provider proof into the smallest honest customer beta.
A licensed Relay Host customer follows a versioned DigitalOcean guide to create
one Ubuntu Droplet, install the npm-delivered Host, acquire the public signed
Cell image, establish authenticated HTTPS, create managed Cells and configure
recovery. Relay does not hold the provider credential or bill and does not
pretend the current Settings preview creates infrastructure.

The beta closes the three defects found by G-085, ships them in matching public
Host/Cell artifacts, reruns the customer-identical journey from those artifacts,
and hands Website an exact claim and support boundary. It also repairs the
production login brand asset failure found in that walkthrough.

## User story

As a licensed Relay Host customer, I want a tested DigitalOcean installation
guide and accurate in-product guidance so that I can operate one customer-owned
Host and its resident Cells without assuming Orionfold manages my cloud account.

## Product contract

### Supported beta topology

- One customer-owned DigitalOcean Ubuntu 24.04 x64 Droplet.
- Minimum proven profile: 2 vCPU, 4 GiB RAM and 80 GiB local disk.
- Optional separate block volume for encrypted recovery bundles.
- Caddy TLS with Relay bound to loopback under `remote-authenticated` ingress.
- Docker and Cosign on the Host; managed Cells use the exact signed release
  digest and remain private except through the Host ingress.
- BYOK hosted inference or a separately sized private model runtime. G-085's
  small Ollama proof is connectivity evidence, not a production sizing promise.

### Customer and Orionfold responsibilities

The customer owns the DigitalOcean account, infrastructure bill, DNS/hostname,
SSH access, backups, provider credentials, runtime keys and Host administration.
Orionfold supplies the npm Host software, public signed Cell image, offline
signed Host entitlement, versioned guide, release checks and product support
within this topology. Same-Host Cells trust the Host administrator.

### Product states

1. **Local Device:** existing licensed local Host journey.
2. **DigitalOcean guided beta:** validated external topology with a guide link;
   Relay does not request a provider token or create a VM.
3. **Cloud Server Preview:** deterministic simulation retained for planning and
   training, explicitly distinct from the guided beta.

The Settings surface must never label the preview as the real DigitalOcean
journey or imply that Install Host mutates a cloud account.

## Acceptance criteria

1. A versioned customer guide covers account guardrails, Droplet/firewall,
   non-root installation, Docker/Cosign, TLS/first-admin, license activation,
   Host/Cell lifecycle, runtime configuration, encrypted recovery, update,
   rollback, troubleshooting and complete teardown with named failure states.
2. Settings presents DigitalOcean as a validated guided beta, links to the
   customer guide, retains Cloud Server Preview as simulation, and says no
   provider token or VM is created by Relay.
3. The unauthenticated production login renders the canonical Orionfold mark
   from a customer-identical prebuilt release without a failed asset request;
   signed-in brand rendering remains unchanged.
4. The G-085 anonymous provenance, mode-0700 ownership and non-root purge fixes
   are present in the public release, with their targeted regressions green.
5. The coupled release has matching npm/GitHub version and immutable signed
   multi-architecture Cell authority; anonymous acquisition and verification
   pass from a clean environment.
6. A fresh customer-identical DigitalOcean run installs only the public release
   artifacts and passes authenticated first-admin, Host entitlement, one Cell,
   capacity/isolation, retain/purge, recovery/restart and zero-orphan cleanup.
7. `_ASSETS` catalog, journeys, screenshots, guides, API tracker and demo are
   reconciled, with a strict fully verified asset-flow receipt.
8. The canonical Host/Cell handoff names the exact released version/digest,
   bounded claims, support boundary, staging receipt and Website G-047 as the
   next public-launch owner.

## Failure behavior

- Missing or mismatched public artifacts block provider creation and Website
  claims.
- Unsupported architecture, signature/provenance mismatch, public Cell/runtime
  ports, failed ingress authentication, recovery failure or cleanup residue
  rejects the beta release.
- A customer who needs hostile-admin isolation is directed to separate Hosts,
  not promised isolation from the Host administrator.
- Provider billing lag is recorded as pending only after zero live resources are
  proven; it cannot hide an orphan.
- A missing browser-control binding pauses visual acceptance but does not invite
  an unobserved replacement flow.

## NOT in scope

- DigitalOcean OAuth/token custody or in-app resource provisioning.
- DigitalOcean Marketplace image/listing work; G-103 owns that decision.
- Fleet control, multi-Host authority or multi-provider portability.
- Uptime/SLA, managed Orionfold infrastructure or production LLM performance.
- Provider-native paid licensing or a new hosted entitlement service.

## References

- `features/digitalocean-relay-host-conformance.md`
- `features/licensed-self-service-cloud-deploy-plan.md`
- `docs/relay-host-supervisor.md`
- `docs/relay-host-access.md`
- `docs/relay-cell-recovery.md`
- `_IDEAS/host-cell-fulfill.md`
