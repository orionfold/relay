# Customer Onboarding Auth and Data Repair Plan

Authoritative specifications:

- `features/provider-auth-bootstrap-truth.md` (G-129)
- `features/sample-data-dashboard-reconciliation.md` (G-130)

## Scope challenge

The three auth findings share one source-of-truth boundary and should not be
implemented as separate patches. Existing settings, readiness, Codex isolation,
and provider UI primitives are reusable. Sample-data reconciliation is a
separate one-line behavior change with an independent regression test.

Chosen path: **REDUCE** to two vertical slices. No provider framework rewrite,
routing-policy redesign, or client-side KPI mirror.

Corrective follow-up: reduce again to provider discovery truth only. G-130's
sample-data repair remains accepted. G-129 is reopened for supported CLI/App
Server probing, executable resolution, inaccessible-state handling, and a
customer-identical macOS verification outside the Codex sandbox.

## NOT in scope

- Provider pricing/model-discovery changes: unrelated to credential truth.
- Automatic adoption of global Codex credentials: violates explicit consent.
- Live sharing of global and Relay Codex homes: violates accepted isolation.
- Claude credential copying: the SDK/CLI remains its credential authority.
- Release, publish, or real credential mutation during implementation.

## What already exists

- `getAuthSettings`, `getAuthEnv`, and `buildClaudeSdkEnv` own Claude selection
  and subprocess environment construction.
- `getOpenAIAuthSettings`, isolated `CODEX_HOME`, and
  `readCodexAuthState` own Codex auth state.
- `getRuntimeSetupStates`, provider Settings API, readiness records, and
  `RuntimeRoutingControl` already consume normalized state.
- `SampleDataPanel` owns the deletion mutation; other App Router clients use
  `router.refresh()` after successful mutations.

## Specification and acceptance mapping

| Slice | Acceptance covered | Primary surfaces |
|---|---|---|
| G-129A selected-method enforcement | Anthropic missing/env/DB/OAuth truth | `auth.ts`, `claude.ts`, `runtime-setup.ts` |
| G-129B safe Codex adoption | detected-not-connected, explicit copy, refusal/rollback | path helpers, Codex auth module, adoption API |
| G-129C Settings reconciliation | default method, explanation, immediate provider/routing refresh | provider API and Settings components |
| G-130 route refresh | success exactly once; failure never | `sample-data-panel.tsx` |

## Vertical slices

1. Add pre-fix tests that demonstrate Anthropic API-key fallthrough, OpenAI
   global-session false readiness/default mismatch, and missing App Router
   refresh.
2. Enforce a discriminated Claude auth boundary with named failures and correct
   runtime setup state.
3. Add privacy-safe Codex discovery and an explicit isolated adoption endpoint
   with validation, exclusive creation, owner-only permissions, verification,
   and rollback.
4. Present the adoption opportunity in existing provider Settings and refresh
   provider/routing state after completion.
5. Expire the tagged app-runtime snapshot, then refresh the Agency route only
   after a successful sample deletion.
6. Replace macOS Claude file inference with the documented CLI status probe and
   privacy-safe parsing.
7. Resolve and health-check Codex executable candidates so a broken PATH shim
   cannot mask a healthy official app binary.
8. Discover global Codex login through the supported CLI while keeping Relay's
   isolated App Server account authoritative; distinguish importable files from
   keyring-only sessions.
9. Rebuild and launch staging outside the Codex sandbox, then verify Settings
   against the operator's real Claude and Codex login state.

## Regression test budget

- `src/lib/settings/__tests__/auth.test.ts`: default selection, env injection,
  missing/decrypt failures, OAuth marker.
- `src/lib/settings/__tests__/openai-auth.test.ts`: usable/invalid isolated and
  global auth files plus default selection.
- `src/lib/settings/__tests__/runtime-setup.test.ts`: OAuth/API/dual/unadopted
  matrix.
- New Codex adoption module/route tests: source validation, no overwrite,
  permissions, successful verification, rollback, source byte preservation.
- `src/components/settings/__tests__/providers-runtimes-section.test.tsx`:
  adoption opportunity and immediate refresh.
- `src/components/apps/__tests__/sample-data-panel.test.tsx`: one refresh on
  success and none on failure.
- Static: TypeScript and lint for changed files.
- Runtime smoke: real `npm run dev` instance, provider Settings GET/test path,
  no module-load-cycle error.
- Browser: current isolated staging at port 3199 after rebuild, provider
  Settings truth and Agency sample transition.
- New CLI discovery regressions: Claude authenticated/signed-out/unavailable/
  malformed JSON; Codex broken first candidate/healthy fallback and global
  keyring-only discovery.
- Corrective browser: macOS customer-identical staging launched outside the
  Codex seatbelt so Keychain results are representative.

## Error & Rescue Registry

| Failure | Recovery |
|---|---|
| API-key mode reaches cached OAuth | block before SDK launch with named missing-key error |
| Encrypted key cannot decrypt | use explicit env key only if present; otherwise named decrypt error |
| Global Codex file is malformed/unsafe | refuse adoption without destination write |
| Isolated auth already exists | conflict; require existing sign-out/repair path |
| Copied auth fails Codex verification | remove only new destination and clear isolated metadata |
| Module-load cycle via runtime imports | remove static chat-tools reachability; use dynamic `await import()` and rerun real dev smoke |
| Provider state remains cached | clear readiness/routing caches and refetch after mutation |
| Route refresh fires on failed sample mutation | keep invalidation and refresh after validated success only; protect with negative test |

## Rescue and rollback

## Completion receipt

G-130 remains accepted: Agency sample removal expired the tagged server
snapshot and immediately rebuilt all four KPIs from empty tables. G-129's first
receipt is superseded because its macOS staging process ran inside the Codex
sandbox and could not see Keychain-backed Claude auth. The corrective slice is
complete only after supported probes, focused regressions, TypeScript, runtime
smoke, rebuilt external-context staging, browser evidence, and fresh two-pass
review pass.

Corrective receipt: all gates passed on 2026-07-23. Fifty-six focused checks,
TypeScript, all 3,963 runnable regressions (one intentional skip), real
runtime-graph task `fbee41c2-e019-47b7-8e64-6909c4b8a0fc`, production build,
packed install, privacy-safe API inspection, and in-app browser evidence passed.
The final staging server ran outside the Codex sandbox and detected the
operator's Claude Max and global Codex logins without copying or exposing
credentials.

If two materially different Codex adoption approaches fail verification, retain
normal browser sign-in, remove the adoption UI/endpoint from the slice, and keep
privacy-safe detection as explanatory state. Never weaken isolation or copy an
unvalidated credential file. Sample-data repair can ship independently.
