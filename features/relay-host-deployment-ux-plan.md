---
title: G-084 Host deployment UX implementation plan
status: completed
goal: G-084
date: 2026-07-18
specification: features/relay-host-deployment-ux.md
---

# G-084 Host deployment UX implementation plan

## Scope challenge result

**PROCEED as selected.** Implement the complete local/fake-provider Settings
journey and existing G-083 lifecycle. Do not absorb DigitalOcean, Fleet control,
Website commerce, release activity, or domain authority that G-083 does not own.

## What already exists

| Existing surface | Reuse |
|---|---|
| `src/lib/host/supervisor/*` | Host registry, paid admission, immutable manifest, collisions, lifecycle, receipts and fake/Docker/provider boundaries |
| `src/lib/licensing/host-entitlement.ts` | exact entitlement, limits, lapse and continuity policy |
| `src/lib/recovery/*` | customer-owned encrypted recovery and verified-checkpoint vocabulary |
| `src/app/settings/page.tsx` | canonical Settings destination and hash anchors |
| Settings cards/shared shadcn components | established loading/error/action and responsive patterns |
| `design-system/MASTER.md`, `src/app/globals.css` | semantic surfaces, status, focus, interaction and system-cursor contract |
| accepted G-094 digest | immutable public Cell artifact authority |

## Specification mapping and vertical slices

1. **Journey contracts/catalog:** strict schemas, bundled dated local/preview
   estimates, plan digest, downstream invalidation and redaction scanner.
2. **Durable coordinator:** atomic content-free journey store, license summary,
   preflight/authorization/install transitions, fake provider receipt and
   preview-runtime reconstruction after reload.
3. **Host API:** one strict read/mutation boundary that delegates every Host/Cell
   mutation to the G-083 supervisor, maps named errors, closes registries, and
   never returns paths/secrets.
4. **Settings UX:** compare, configure/estimate, progress, inventory, handoff,
   recovery/unsupported capability disclosures, safe retain/purge confirmations
   and responsive accessible state announcements.
5. **Verification/docs:** targeted contracts/store/service/API/component tests,
   affected Host suite, type/build, real dev request smoke, responsive browser
   evidence, fresh review, docs/backlog/workstream reconciliation.

## Regression-test budget

- Contracts/catalog: strict request/state parsing; deterministic estimates;
  stale field invalidation; source date/exclusions; credential/content rejection.
- Store/service: reload, lock/atomic failure, invalid/newer state, unlicensed and
  lapsed gates, plan mismatch, fake authorization discard, idempotent install,
  collision/capacity/partial receipts and preview-runtime reconstruction.
- API: all actions, status mapping, malformed JSON/unknown fields, named errors,
  no envelopes/paths/secrets in responses and registry closure.
- Component: unlicensed comparison, stale edit, disabled duplicate action,
  lifecycle receipt, lapse, retain copy, typed purge and external-link semantics.
- Affected gate: supervisor, Host entitlement, ingress, recovery and Cell
  artifact/publication suites.
- Static/runtime: TypeScript, production build, `git diff --check`, dev-server
  GET/mutation smoke against an isolated Host/data root.
- Browser: 1440/944/390px light/dark, keyboard/focus/live regions, overflow,
  reload/back and system-cursor computed-style checks.

## Error & Rescue Registry

| Failure | Visible evidence | Rescue |
|---|---|---|
| no/invalid/lapsed grant | exact Host license code and read-only comparison/inventory | install/renew signed license; existing continuity remains |
| stale draft/estimate/preflight | stale reason and invalidated downstream steps | review new estimate and rerun preflight |
| journey lock/corruption/newer schema | named store error; no Host/runtime mutation | restore/remove only the journey receipt after preserving Host registry |
| provider authorization absent | no install and no resource reference | reconfirm the redacted plan; no secret recovery needed |
| Host already differs | exact identity/config mismatch | open current inventory or choose a separate Host root/machine |
| admission/collision/capacity refusal | supervisor reason and zero new allocation | change Cell/port/size/count or install larger signed grant |
| runtime partial | durable lifecycle receipt and resource references | reconcile through Host domain; retain existing data |
| recovery evidence absent | export-release disabled with named prerequisite | create and verify recovery from the Cell, then retry |
| purge mismatch | destructive refusal and unchanged Cell | re-enter exact Cell ID after reviewing retained recovery |
| browser request interrupted | pending state clears and persisted receipt is reloaded | refresh; operation ID replay prevents duplicate effects |

## Rescue and rollback

The feature is additive to Settings. Removing its component/API/coordinator
leaves the G-083 CLI, Host registry and direct Relay path intact. Journey state
is separate and content-free. No migration touches a Cell DB. A failed build or
runtime check reverts only G-084-owned code before any release; no external
resource is created by the fake provider.

## Verification order

1. contracts/catalog/store/service tests;
2. API and component tests;
3. affected Host/ingress/recovery/licensing gate;
4. TypeScript, token validation and production build;
5. isolated dev-server request/runtime smoke;
6. 1440/944/390px light/dark browser walkthrough and accessibility checks;
7. fresh two-pass security/code review and acceptance traceability;
8. docs/backlog/workstream closeout and local goal-owned commit.

## NOT in scope

- real provider APIs, credentials, bill or spend;
- Website checkout/issuer, release or publish;
- remote Fleet authority;
- implementing new upgrade/rollback/transfer domain actions; or
- exposing filesystem paths, license envelopes, provider credentials, content
  or raw runtime logs to the browser.
