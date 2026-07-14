# G-048 Fresh-Clone Development Setup — Implementation Plan

**Goal:** Make a literal Relay clone follow one documented, side-effect-free
development setup on macOS and Windows, with portable hooks and deterministic setup
feedback evidence.

**Specification:** `features/fresh-clone-development-setup.md`

## Scope challenge

**PROCEED as-is.** Reuse the existing instance-bootstrap gates, dashboard welcome
state, provider settings, Ollama routes/components, and test stack. The bounded change
is documentation, a Node port of the tracked secrets hook, and acceptance coverage.
Do not redesign bootstrap or provider architecture.

## NOT in scope

- Provider/routing refactors: the reported runtime symptom is not currently reproduced.
- Customer bootstrap changes: existing consent and override semantics are controls.
- New onboarding UI: the contributor contract belongs in source documentation.
- A new test framework: Vitest, Testing Library, Node test, and GitHub Actions suffice.
- Push, release, or publish: native remote execution remains operator-gated.

## What already exists

- `isDevMode()` and `ensureInstance()` short-circuit on `RELAY_DEV_MODE=true` or
  `.git/relay-dev-mode`, with `RELAY_INSTANCE_MODE=true` as the explicit override.
- Bootstrap unit tests already prove branch/hook absence for the env gate and basic
  sentinel skip behavior, plus customer-mode execution.
- `WelcomeLanding` owns the fresh dashboard state and has component coverage.
- `ProvidersAndRuntimesSection` already renders unconfigured and named error/retry
  states; its regression suite covers both.
- `OllamaSection` already exposes Save and Test controls with visible status/toasts,
  but lacks direct component tests for those outcomes.
- `.codex/hooks/secrets-guard.py` contains a small deterministic guard whose patterns
  and exit contract can be ported directly to dependency-free Node.
- Existing staging harnesses explicitly clear development mode for customer-equivalent
  runs and can remain customer-mode controls.

## Specification and acceptance mapping

| Acceptance area | Implementation slice | Evidence |
|---|---|---|
| Pre-boot setup | README shell-specific commands | command replay in clean clone |
| Portable hook | dependency-free `.mjs` guard + hooks config | Node tests on macOS/Windows |
| Dev gates | strengthen zero-mutation assertions | targeted bootstrap suite |
| Empty/error UI | reuse dashboard/provider tests | named component suites |
| Ollama Save/Test | add component regression tests | unavailable, available, save success/failure |
| Customer behavior | no implementation change | targeted bootstrap + customer boot smoke |
| Host matrix | focused fresh-clone workflow | native macOS/Windows jobs on Node 20 and 22 |

## Implementation order

1. Create the durable specification and this acceptance map.
2. Port the secrets guard to dependency-free ESM, preserve CLI exit semantics, and
   point `.codex/hooks.json` at `node .codex/hooks/secrets-guard.mjs`.
3. Add a Node test suite for secret signatures, placeholder allowances, `.env`
   staging, malformed input, exit code, and hook configuration portability.
4. Add `test:hooks` and a focused cross-host workflow using Node 20/22.
5. Update README with equivalent Bash and PowerShell pre-boot
   commands, isolated data, optional credentials, sentinel, and customer override.
6. Strengthen bootstrap tests to assert no instance DB, branches, hooks, push config,
   or schedule mutations under both development gates.
7. Add `OllamaSection` tests for Save success/failure and unavailable/available Test
   feedback; run existing dashboard and provider-state tests as controls.
8. Replay the documented path in a literal local clone on macOS, then run customer
   mode against isolated data and inspect git state before/after.
9. Run the native Windows workflow after the operator-authorized push. If it passes,
   record evidence, close the feature/changelog/backlog, and commit the receipt.

## Regression test budget

| Changed/guarded behavior | Test | Edge cases |
|---|---|---|
| Secrets hook runtime and matching | `.codex/hooks/secrets-guard.test.mjs` | malformed JSON, placeholders, provider tokens, generic literals, `.env` add/commit |
| Hook config | same Node suite | command uses Node and no Python/shell-specific quoting |
| Env development gate | `bootstrap.test.ts` | no branch, hook, config, DB, or schedule artifacts |
| Sentinel development gate | `bootstrap.test.ts` | same zero-mutation assertions without env state |
| Customer override | existing `bootstrap.test.ts` | opt-in beats both opt-out paths |
| Dashboard empty state | `welcome-landing.test.tsx` | empty first-run CTA and links |
| Provider setup | `providers-runtimes-section.test.tsx` | unconfigured plus non-OK/error retry |
| Ollama setup | new `ollama-section.test.tsx` | save OK/non-OK, test unavailable/available, stale model clearing |
| Literal clone | `scripts/fresh-clone-dev-smoke.mjs` | no prior env/data/credentials/Ollama, both gates, no bootstrap mutations |
| Cross-host compatibility | `.github/workflows/fresh-clone-dev.yml` | macOS/Windows, Node 20/22 |
| Customer bootstrap | existing bootstrap suite + staging boot | dev vars cleared, normal Phase A behavior retained |

Verification order and expected commands:

1. `npm run test:hooks` — Node hook suite passes.
2. `npx vitest run src/lib/instance/__tests__/bootstrap.test.ts src/components/dashboard/__tests__/welcome-landing.test.tsx src/components/settings/__tests__/providers-runtimes-section.test.tsx src/components/settings/__tests__/ollama-section.test.tsx` — all focused behavior passes.
3. `npx tsc --noEmit` — no type errors.
4. `node scripts/fresh-clone-dev-smoke.mjs --gate env` and `--gate sentinel` from a
   literal clone — no generated branch/hook/config/schedule state.
5. Start `npm run dev` with a fresh `RELAY_DATA_DIR`; inspect dashboard, provider
   settings, and Ollama unavailable/available feedback in a real browser.
6. Run customer-mode bootstrap smoke with development variables cleared and compare
   expected Phase A state.
7. Run the same focused smoke on native Windows via the committed workflow.

## Error & Rescue Registry

| Failure mode | Rescue strategy |
|---|---|
| Node regex behavior differs from Python | Add parity fixtures and compare old/new output before deleting Python source |
| Hook path fails on Windows shell | Keep command to unquoted, space-free `node .codex/hooks/...mjs`; assert config text on Windows |
| Fresh clone smoke would touch user data | Require a generated temp clone and temp `RELAY_DATA_DIR`; fail if either resolves outside temp |
| Next dev leaves a process behind | Track PID, terminate in `finally`, preserve logs in temp/output |
| Ollama absent | Use a deterministic unavailable endpoint; use a local stub server for available behavior |
| UI mock hides route regression | Pair component tests with live fresh-data browser/API smoke |
| Customer behavior changes | Stop, restore the existing bootstrap contract, and keep contributor setup additive |
| Native Windows job cannot run | Do not close G-048; present the exact push/CI gate and evidence still missing |

## Stop condition

After two materially different attempts fail on the same acceptance blocker, stop with
the command, output, changed files, and safest next action. Do not close G-048 until
native Windows evidence and the local acceptance packet both pass.
