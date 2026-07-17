# G-096 implementation plan — canonical managed Relay Cell identity

Authoritative behavior: `features/relay-host-cell-isolation-boundary.md` G-096
amendment and accepted TDR-044.

## Scope challenge

- **REDUCE:** Settings-only repair leaves execution previews contradictory and
  fails the Goal Contract.
- **PROCEED:** one lightweight validated environment resolver, existing response
  shapes, all current boundary callers. Selected.
- **EXPAND:** rename `instanceId` to `cellId` or add Host routing. Deferred as
  compatibility churn and unrelated lifecycle authority.

## What already exists

- `src/app/api/health/ready/route.ts` already owns the accepted DNS-label
  grammar and stable `CELL_ID_INVALID` readiness response.
- `getRelayCellBoundary()` is already the sole source for Settings and both
  execution-target routes.
- `buildRelayExecutionContext()` already narrows Cell facts before returning
  them to task/workflow clients.
- Settings and execution previews already render a non-null `instanceId`; no UI
  component redesign is required.
- G-093 already provides a repeatable arm64 artifact build/verifier and hardened
  container smoke harness.

## Specification and acceptance mapping

| Acceptance criterion | Implementation slice |
|---|---|
| Managed no-git ID agrees across readiness/config/UI/targets | shared resolver + boundary precedence + route/component/integration tests + OCI browser smoke |
| Invalid ID fails closed without fallback | named identity error + readiness stable reason + boundary tests |
| Dev/npx/git behavior is preserved | resolver matrix around absent environment state |
| Public contracts remain compatible | retain `instanceId` and readiness response shapes; contract-key assertions |
| Entrypoint/app grammar remains aligned | unit grammar cases + artifact build/verify + real container startup |

## Implementation slices

1. Add the pre-fix no-git+environment regression matrix at the boundary, config
   API, Settings and execution context layers.
2. Move the DNS-label grammar and named environment parsing into
   `src/lib/config/env.ts`; make readiness consume it with its `local` fallback.
3. Give `getRelayCellBoundary()` managed environment identity precedence, then
   retain the existing dev/no-git/git fallback tree.
4. Run targeted tests, affected instance/target/health suites, typecheck,
   documentation links and diff checks.
5. Rebuild and verify the arm64 artifact; start a fresh loopback-only hardened
   Cell and capture readiness, Settings and execution-target browser evidence.
6. Fresh-review the diff, update R1/backlog/changelog/docs, clean goal-owned
   resources, and commit locally.

## Regression test budget

- New: `src/lib/instance/__tests__/cell-boundary-resolution.test.ts` for valid,
  invalid, precedence, absent dev/no-git and git-backed cases.
- Extend health routes for absent/local and invalid named-error parity.
- Extend instance config route for forwarding a managed no-git boundary.
- Extend InstanceSection for no-git managed ID rendering without the false
  `Not initialized` value.
- Extend task/workflow target route tests to assert an environment-backed Cell
  ID in both ready and blocked contexts.
- Existing execution-preview component test protects the visible short ID.
- Runtime smoke: G-093 artifact build/verify, readiness curl, Settings browser
  snapshot, workflow target browser snapshot. No runtime-registry modules change,
  so the TDR-032 real-task import-cycle smoke is not triggered.

## Error & Rescue Registry

| Failure | Visible behavior | Rescue |
|---|---|---|
| Invalid `RELAY_CELL_ID` | readiness 503 `CELL_ID_INVALID`; Settings named load failure; target named resolution failure | correct the Host manifest/env; never fall back to git or generated identity |
| Environment resolver imports heavyweight instance state | build/module loading regression | keep resolver in `config/env.ts`; readiness imports no bootstrap/settings module |
| Unmanaged npx/dev behavior changes | regression matrix fails | restore absent-environment fallback tree independently from managed identity |
| Artifact build cannot reproduce locally | preserve code/test evidence and report exact artifact blocker after two approaches | use accepted G-093 build script; do not substitute different bytes silently |
| Browser tool binding fails | no operator hold | use the supported Playwright fallback and retain harness note |

## NOT in scope

- Public `instanceId`→`cellId` schema rename: unnecessary compatibility break.
- Persisting a second Cell identity: environment/manifest remains authoritative.
- Host supervisor, routing, Fleet Controller or remote authority: G-083/G-081.
- Project/customer context repair: G-097.
- Registry publication, release, version bump or public claims: G-094 and an
  explicit operator gate.
