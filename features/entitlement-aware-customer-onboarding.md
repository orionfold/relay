---
title: Entitlement-Aware Customer Onboarding
status: in-progress
priority: P1
milestone: post-mvp
source: _IDEAS/triage.md
dependencies: [npm-customer-install-integrity]
---

# Entitlement-Aware Customer Onboarding

## Description

Relay currently shows much of the same first screen and Settings language to
Community, Pack, Host and combined customers. It can prioritize Pack authoring
when the customer wants to explore an existing Pack, describe Host trust before
Host is relevant, lead License with signature/storage mechanics, and repeat the
same annual product price inside every premium Pack card.

This feature establishes one entitlement-aware orientation and activation
journey. It preserves local-first/offline licensing and current surfaces while
making value, state and next action obvious.

## State model

The UI must distinguish:

- Edition: Community or licensed distribution.
- Licensee identity: who the license belongs to.
- Entitlements: premium Packs, managed Host/capacity, or both.
- Pack availability: bundled/free, entitled, locked.
- Pack lifecycle: not installed, installing, installed, update available.
- Host lifecycle: unavailable preview, entitled/not configured, configuring,
  ready, degraded.
- License lifecycle: none, loading, invalid, active, expiring, lapsed, removed,
  read error.

No surface may reduce this model to a generic "licensed" boolean.

## First-screen behavior

Candidate actions are ranked by state, not universally:

- Community, no Pack: understand Relay, install the free Agency starting point,
  or ask docs-grounded Chat.
- Pack entitled, not installed: activate/install selected Packs.
- Installed Pack: open the Pack or continue its first workflow.
- Host entitled: understand and optionally configure managed Cells.
- Pack + Host: summarize both and continue the incomplete/highest-value journey.
- Returning active customer: dashboard and recent activity, not first-run copy.

The implementation must make an explicit product decision between automatic
Agency installation and guided opt-in. "Bundled" must never be rendered as
"installed."

## Settings continuity

- License leads with edition/entitlement value and the applicable lapse
  continuity promise.
- Instance boundary language adapts by state while retaining the warning that
  records inside one Relay workspace are not security isolation.
- Licensee identity and entitlement badges remain separate.
- The Host section connects to the entitlement summary and retains its visual
  progress indicator.
- Without Host entitlement, the progress indicator is a capability preview,
  not unfinished mandatory setup or a pressure-oriented upsell.
- Signature, file location, raw IDs and offline verification live under
  technical/trust detail.

## Premium Pack acquisition

- One offer block above the catalog owns the product price and all-Packs value.
- Individual cards use compact decision fields: Job, Choose it when, Includes,
  and Works with/bundle relationship.
- Checkboxes select Packs; they do not purchase, activate or install.
- Community customers can retain selection across checkout/license activation.
- Entitled customers use the same selection with **Install selected**.
- Free, locked, installed, update, bundle/component overlap and error states
  remain explicit.

## Agency sample-data lifecycle

- Seeded rows carry durable sample provenance.
- All derived Pack KPIs and workflow/Table surfaces disclose sample state.
- The customer can preview and confirm a transition away from untouched sample
  data.
- Customer-created and edited data is never deleted by that transition.
- Calendar-sensitive sample KPIs remain illustrative or clearly explain their
  time basis.
- Real billing policy and invoicing remain owned by G-015.

## Acceptance criteria

- [x] One API/presentation contract returns edition, licensee, entitlement,
      Pack and Host state without conflating them.
- [x] Community, Pack, Host and combined first screens expose contextual primary
      and secondary actions.
- [x] Available Agency is never described as installed.
- [x] Top bar, License, instance boundary and Host section agree in every state.
- [x] Lapse promises distinguish Pack installs/updates from managed-Cell
      expansion while preserving existing content/export/recovery truth.
- [ ] The premium catalog shows one price/offer and no per-Pack purchase
      implication.
- [ ] Pack selection survives the activation handoff and handles cancel/failure.
- [ ] Sample Agency records/KPIs are labeled everywhere they surface.
- [ ] Sample removal/replacement preserves edited and customer-created data.
- [ ] Desktop/390 px, light/dark, keyboard, focus and screen-reader checks pass.

## Operator decisions

Before final implementation acceptance, the operator approves:

1. Auto-install versus explicit guided install for free Agency.
2. Final first-screen ICP message hierarchy.
3. Public price, founding/list/renewal and CTA language.
4. Default sample-data load versus explicit sample opt-in.

Fixture-backed state modeling, data provenance and no-loss regressions can
proceed before those copy/taste gates.

## G-116 acceptance receipt — 2026-07-22

G-116 introduced one typed customer-orientation resolver and read API shared by
Home, the app-bar identity cluster, License, the Relay data boundary, and the
Host deployment section. The resolver keeps signed licensee identity,
entitlement classes, Pack installation and Host readiness separate; treats
invalid signatures and read failures as named states; preserves Pack and Cell
continuity after lapse; and never infers that bundled Agency is installed.

Fresh Community customers now receive the approved guided one-click Agency
install, while Pack-only, Host-only and combined customers receive the shortest
action for what they actually unlocked. License activation/removal refreshes
the shared identity immediately. Host progress remains visible as an explicitly
optional capability preview when Host is not entitled.

Verification passed 50 focused component/API/state regressions, 210 broader
licensing/Host/Pack checks, TypeScript, production build, and disposable
desktop/390 px light/dark browser checks. The browser proof exercised the real
Agency installer, observed its success receipt, navigated to the installed Pack,
and confirmed the returning dashboard path. G-117 and G-118 retain the unchecked
premium-catalog and sample-provenance criteria.

## Scope boundaries

**Included:** welcome/dashboard orientation, shell/Settings entitlement identity,
premium Packs catalog/activation, Agency sample provenance and transition.

**Excluded:** a new checkout service, per-Pack SKUs, mandatory registration,
telemetry, real agency billing policy, Host provisioning implementation.

## References

- TRIAGE-037, TRIAGE-038, TRIAGE-041, TRIAGE-043, TRIAGE-045
- TRIAGE-044, TRIAGE-049
- G-116, G-117, G-118
