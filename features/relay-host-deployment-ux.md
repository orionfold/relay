---
title: Local-device and cloud-Host deployment UX
status: completed
goal: G-084
date: 2026-07-18
specification: features/licensed-self-service-cloud-deploy.md
wireframe: features/licensed-self-service-cloud-deploy-wireframe.md
dependencies:
  - relay-host-supervisor
  - host-ingress-identity
  - host-recovery-portability
  - relay-cell-oci-publication
---

# Local-device and cloud-Host deployment UX

## Outcome

Settings gains one licensed Relay Host surface that takes a customer from a
plain-language Local Device versus Cloud Server comparison through Configure,
Estimate, Authorize, Install, Create Cells, Verify and Handoff. It then exposes
the safe lifecycle actions already owned by the G-083 Host supervisor and links
recovery-dependent operations to the G-082 recovery surface.

The first release is executable on this device and conformance-testable through
the deterministic fake VM/provider boundary. It does not create a real cloud
resource. DigitalOcean remains G-085 and multi-Host Fleet authority remains out
of scope.

## Scope challenge

- **REDUCE:** local-only lifecycle would leave the accepted placement and
  authorization journey untested.
- **PROCEED — selected:** ship the full local/fake-provider journey backed by
  the accepted G-083 domain and durable content-free journey receipts.
- **EXPAND:** a real provider, Fleet controller, commerce, or new Host lifecycle
  authority belongs to G-085, G-060, Website G-030, or a separately specified
  domain goal.

## Product contract

### Availability

- The comparison, ownership model, Host-administrator trust boundary, separate
  VM rescue, pricing methodology, and feature limitations are readable without
  a Host entitlement.
- Configure and mutation controls require an effective signed
  `product:relay-host` grant. Lapse preserves inventory, receipts, recovery
  guidance, stop/restart of receipt-bound Cells, retained removal and purge;
  it blocks expansion and routine feature upgrades through G-095 policy.
- The UI names `Preview provider` as a deterministic simulation. It never
  implies that a VM exists or that the displayed amount is a provider bill.

### Journey

1. **Placement:** choose `local` or `cloud-preview`; both explain ownership,
   availability, failure domain, Host trust, and separate-machine rescue.
2. **Configure:** choose opaque Host ID, region reference, Host size, cell count,
   exposure, runtime profile, backup profile and expected concurrency.
3. **Estimate:** compute Host count, provisional admission, reserve and dated
   infrastructure range from a versioned bundled catalog. The source date,
   currency, exclusions and provider-bill authority remain visible. Editing a
   cost- or capacity-bearing field invalidates prior preflight/authorization.
4. **Authorize:** local placement records explicit consent to the stated Host
   changes. Cloud preview records only a boolean confirmation; it accepts and
   persists no provider credential, token or authorization code.
5. **Install:** initialize the G-083 Host registry or reuse an exactly matching
   Host. Development/test uses a durable preview runtime; packaged production
   uses the signed Docker Cell path.
6. **Create Cells:** strict opaque Cell/owner references become G-083 manifests
   pinned to the accepted public Relay Cell digest. Admission, collisions,
   license limits and runtime verification remain domain-owned.
7. **Verify and handoff:** show Host/cell identity, capacity, trust, artifact,
   receipt, recovery readiness, runtime mode and safe next actions. A preview is
   labeled `Simulation ready`; only production evidence may say `Ready`.

### Lifecycle

- The surface supports inventory, create, start, stop, restart, retain and
  purge through `RelayHostSupervisor` with a client-generated operation ID.
- Duplicate operation IDs replay the same receipt; a second click while a
  request is pending is disabled client-side and remains safe server-side.
- Retain removes runtime resources but preserves Cell data and counts toward the
  licensed limit. Purge requires typed Cell ID confirmation and deletes only
  the derived Cell root after the accepted domain containment checks.
- Export-and-release is presented only when an exact G-082 verified checkpoint
  can be bound server-side. Otherwise the UI links to Encrypted Recovery and
  names the missing prerequisite rather than accepting filesystem paths from
  the browser.
- Upgrade, rollback and ownership transfer are visible as lifecycle capability
  disclosures but are disabled until their accepted domain contracts exist.
  G-084 does not invent no-op authority or claim those operations succeeded.

## Durable journey and API boundary

The journey store lives under the Host root, separate from every Cell. It stores
only strict configuration references, step/state, plan digest, estimate input
version, provider resource reference for the fake provider, operation IDs,
reason codes and timestamps. Atomic replacement and a short exclusive lock
protect concurrent writes. Unknown schema or content/credential-shaped keys fail
closed.

The browser receives no license envelope, provider secret, Cell secret, raw
runtime log, filesystem path, customer content, or stored credential. Mutations
use a strict discriminated request schema and return named error codes. The
existing Host ingress/session boundary protects remote access; this feature adds
no unauthenticated listener.

## Accessibility and responsive behavior

- Native controls, logical headings, field labels, visible focus, polite status
  announcements and assertive named errors.
- Status always has text and icon; destructive confirmation is not conveyed by
  color alone.
- System/browser cursor only, with no authored cursor overrides.
- At 1440px configuration and estimate are side-by-side; 944px and 390px stack
  without hiding ownership, cost, scope, recovery or purge information.
- No horizontal overflow; external destinations use an external-link icon and
  a new tab.

## Acceptance criteria

- [x] Settings renders the unlicensed comparison and truthful paid gate.
- [x] A licensed local or fake-cloud-preview draft survives reload and stale
  edits invalidate downstream state with an explanation.
- [x] Estimate output is reproducible, dated, provisional, and separates model
  charges from infrastructure.
- [x] Authorization stores no credential and install delegates to the G-083
  Host initializer.
- [x] Create/start/stop/restart/retain/purge delegate to the supervisor and show
  durable named receipts and safe rescue copy.
- [x] Collision, capacity, invalid license, lapse, duplicate/replay, partial,
  stale-plan and purge-confirmation failures are visible and test-protected.
- [x] Browser evidence covers 1440/944/390px in light/dark, keyboard focus,
  live-region semantics, no overflow, no secret/content leakage, and system
  cursor behavior.
- [x] Targeted, affected Host, type/build, runtime smoke and fresh security/code
  review pass before G-084 closes.

## Completion receipt — 2026-07-18

- Settings ships the unlicensed comparison and paid local/fake-provider journey,
  backed by a strict content-free store, plan digest, named errors, the G-083
  supervisor, and the accepted `0.44.3` public Cell digest.
- 22 G-084 tests, 135 affected Host/ingress/recovery tests, and the complete
  3,793-test Relay suite pass; TypeScript, CLI build, production Next build,
  token validation, API/docs/stats/catalog gates, and fresh two-pass review pass.
- Browser evidence under `output/g084/` covers 1440/944/390px light and dark.
  The Host card has zero overflow, no authored cursor override, named headings,
  focus/live status semantics, external-link disclosure, and no browser errors.
  The already-tracked G-024 Settings-shell overflow remains outside this card.
- No live provider, credential, bill, push, publish, release, or other external
  product mutation was performed. Real provider conformance remains G-085.

## NOT in scope

- real DigitalOcean/provider authorization, spend, DNS, firewall or VM writes;
- Fleet Controller or control of a Cell on another Host;
- Website checkout, price selection, license issuance or public claims;
- new upgrade/rollback/transfer authority not present in G-083;
- customer content, credentials or raw logs in Host/journey receipts; or
- release, publish, push, version bump or staging acceptance.

## References

- `features/licensed-self-service-cloud-deploy.md`
- `features/licensed-self-service-cloud-deploy-wireframe.md`
- `features/relay-host-supervisor.md`
- `features/host-recovery-portability.md`
- `features/relay-host-deployment-ux-plan.md`
