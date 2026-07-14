---
title: Fresh-Clone Development Setup
status: completed
priority: P1
milestone: post-mvp
source: _IDEAS/triage.md#TRIAGE-014
dependencies: [instance-bootstrap]
---

# Fresh-Clone Development Setup

## Description

Relay contributors need one explicit path from a literal clone to a safe development
instance. The path must activate development mode before the first application boot,
use an isolated empty data directory, and work on supported macOS and Windows hosts
without relying on undocumented global tools. Development mode must remain a hard
no-op for instance bootstrap: it cannot create the `local` branch, install a pre-push
hook, or register customer-instance automation.

The verified defects are narrower than the original report: the README currently
starts `npm run dev` without first activating either development-mode gate, and the
tracked Codex hook invokes Python even though Python is not a Relay prerequisite.
The provider runtime failure from the intake report has not been reproduced, so this
feature verifies current empty, error, Save, and Test behavior rather than claiming a
provider implementation fix.

## User Story

As a Relay contributor on macOS or Windows, I want a copy-pasteable fresh-clone setup
that uses only Git, supported Node/npm, and Relay itself, so that my first development
boot is isolated, visibly configurable, and cannot mutate customer-instance git state.

## Required Behavior

### One pre-boot development contract

- A contributor clones the repository and installs dependencies.
- Before the first `npm run dev`, the contributor creates `.env.local` with both
  `RELAY_DEV_MODE=true` and a clone-local `RELAY_DATA_DIR`.
- The documented macOS/Linux and PowerShell commands express the same state.
- `.git/relay-dev-mode` is documented as the durable secondary safety gate and can be
  used independently of `.env.local`.
- Provider credentials are optional. A fresh empty instance must load without them.

### Bootstrap invariants

- `RELAY_DEV_MODE=true` returns `dev_mode_env` before any instance configuration,
  branch, hook, git config, or schedule registration.
- `.git/relay-dev-mode` returns `dev_mode_sentinel` with the same zero-mutation result.
- `RELAY_INSTANCE_MODE=true` still overrides both development gates for explicit
  customer-mode bootstrap testing.
- Customer mode retains its current consent-gated bootstrap behavior.

### Portable tracked hooks

- Tracked Codex hooks use the Node runtime already required by Relay.
- The secrets guard preserves its allow/block contract and exit codes on all supported
  hosts; malformed input fails open, while real-looking secrets and `.env` staging
  attempts are blocked with a named message.
- Hook configuration contains no Python prerequisite or shell-specific path quoting.

### Fresh-instance setup feedback

- The dashboard renders its existing welcome/empty state against an empty data dir.
- Provider settings visibly show unconfigured runtimes and a named load error with a
  retry action when provider state cannot load.
- Saving an Ollama base URL produces a visible success or failure outcome.
- Testing an unavailable Ollama endpoint produces a visible failure.
- Testing an available Ollama endpoint produces a visible connected state and model
  count.

## Acceptance Criteria

- [x] README presents equivalent macOS/Linux and PowerShell paths, and both activate
  dev mode plus isolated data before first boot. The PowerShell path is statically
  covered by the committed native workflow; live Windows execution was waived by the
  operator because no Windows environment exists yet.
- [x] The README commands replay successfully from literal macOS clones with no prior
  `.env.local`, Relay data, provider credentials, or Ollama configuration. Windows
  replay remains encoded in the retained workflow under the same operator waiver.
- [x] `.codex/hooks.json` runs a dependency-free Node secrets guard, and its regression
  suite passes on the minimum and current supported Node majors on macOS. Native
  Windows execution remains deferred under the recorded operator waiver.
- [x] Both development gates leave branches, hooks, git config, instance state, and
  schedules untouched in isolated tests.
- [x] `RELAY_INSTANCE_MODE=true` and ordinary customer mode retain the existing
  instance-bootstrap behavior in targeted tests and a real boot smoke.
- [x] A fresh empty data directory renders the dashboard welcome state and provider
  unconfigured/error states without credentials.
- [x] Ollama Save and unavailable/available Test paths each have a deterministic,
  visible assertion.
- [x] The macOS literal-clone matrix passes locally.
- [x] Native Windows execution disposition is explicit: on 2026-07-13 the operator
  waived this unavailable environment and directed G-048 to close. The committed
  Windows Node 20/npm 10 and Node 22/npm 11 jobs remain the future verification path;
  this checkbox records the waiver, not a passing Windows run.

## Compatibility and Non-Goals

Included:

- Contributor source setup documentation in the tracked README.
- The tracked Codex secrets guard and its platform matrix.
- Regression coverage for existing bootstrap and setup UI behavior.
- A native macOS/Windows fresh-clone CI smoke using supported Node/npm.

Excluded:

- Redesigning provider authentication, routing, or the Settings information
  architecture; the current behavior is under verification, not replacement.
- Changing customer-instance consent, branches, guardrails, or upgrade scheduling.
- Bundling Python, PowerShell, Ollama, or provider credentials.
- Fixing the unverified historical provider-runtime symptom without a reproduction.
- Publishing, pushing, or releasing; those remain separate operator gates.

## Failure States

| Failure | Required outcome |
|---|---|
| Hook receives malformed/empty JSON | Allow the tool call; the guard must not brick Codex |
| Hook detects secret material | Exit 2 and emit `BLOCKED by secrets-guard` with a named reason |
| Provider settings fetch fails | Replace loading with a visible error and Retry control |
| Ollama settings save fails | Visible error toast; Save control returns to enabled state |
| Ollama is unavailable | Visible failed connection text; no stale models remain |
| Ollama is available | Visible connected text with the returned model count |
| Development gate is omitted | Fresh-clone smoke fails on any generated instance mutation |
| Native Windows evidence is unavailable | Record an explicit operator disposition; never report the workflow definition as a passing run |

## References

- Goal: strategy `_IDEAS/backlog.md` G-048
- Source: strategy `_IDEAS/triage.md` TRIAGE-014 (groomed 2026-07-13)
- Existing bootstrap contract: `features/instance-bootstrap.md`
- Existing bootstrap tests: `src/lib/instance/__tests__/bootstrap.test.ts`
- Implementation plan: `docs/superpowers/plans/2026-07-13-g-048-fresh-clone-development-setup.md`

## Verification run — 2026-07-13 (local acceptance)

- `npm run test:hooks`: 6/6 passed under macOS, Node 22.18.0/npm 10.9.3 and
  Node 20.20.2/npm 10.9.3.
- Focused Vitest packet: 92/92 passed under both Node 22.18.0 and Node 20.20.2
  across bootstrap detection/orchestration,
  upgrade-poller development gating, dashboard empty state, provider empty/error
  state, Ollama Save/Test feedback, and the system-cursor policy.
- `npx tsc --noEmit` and `git diff --check`: passed.
- Literal clone `/tmp/relay-g048-macos.k8frwy/relay`: `npm ci` installed 776 packages
  from the committed tree, the README development files were created before boot, and
  `npm run smoke:fresh-clone-dev` passed. The live Next server returned the Welcome
  dashboard, zero configured cloud providers, Ollama Save plus one available model and
  an unavailable 502 control, no `local` branch, no pre-push hook or pushRemote config,
  no upgrade lock, and no instance settings rows.
- Second literal clone `/tmp/relay-g048-node20.Zs03Tt/relay`: dependencies were
  rebuilt under Node 20.20.2/npm 10.9.3 and the same live fresh-clone smoke passed,
  including the provider/Ollama and zero-instance-mutation assertions. The earlier
  Node 20 attempt correctly failed its clean-clone precondition after the customer
  control had created a `local` branch; evidence was rerun in a new clone rather than
  bypassing that guard.
- Customer-mode control in the same disposable clone with
  `RELAY_INSTANCE_MODE=true`: live Next boot returned the Welcome dashboard, created
  the expected `local` branch and instance/consent rows, and left the pre-push hook
  absent while consent remained `not_yet`.
- Native Windows evidence: not run. No Windows environment exists yet and the workflow
  was not pushed. On 2026-07-13 the operator explicitly waived that host check and
  directed the goal to be unblocked and closed. The committed Node 20/npm 10 and Node
  22/npm 11 Windows jobs remain available for the first future environment; this
  closure does not represent them as passing evidence.
