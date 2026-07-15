# Explicit eligible runtime pool (G-077)

Status: complete — implemented, verified, and accepted 2026-07-15
Date: 2026-07-15
Owner: Relay runtime routing and Settings

## Outcome

Task routing keeps `Latency`, `Cost`, `Quality`, and `Manual` as selection
policies, while a separate Eligible runtimes control defines which configured
runtimes automatic routing may choose. Settings shows configuration, health,
selected model, capability limits, and a specific unavailable or exclusion
reason for every registered runtime. Automatic policies preview the current
order and fallback behavior. Manual routing uses one explicit default runtime.
Task previews and run history name the runtime selected and the evidence or
fallback that led to it.

## Current behavior and drift

- Settings persists only `routing.preference`; there is no eligible-pool,
  Manual-default, fallback, version, or migration contract.
- Selecting Latency, Cost, or Quality rewrites Anthropic/OpenAI authentication,
  provider model defaults, the Chat default, and sometimes Ollama state. A
  later provider edit can silently flip routing back to Manual.
- `resolveTaskExecutionTarget()` considers every configured compatible runtime.
  Manual hard-codes Claude Agent SDK, regardless of operator intent.
- Routing scores make provider-identity assumptions about cost, latency, and
  quality. They cannot truthfully rank an arbitrary Ollama host, LiteLLM
  gateway, or LM Studio server from its product name.
- Selection mode and reason exist in memory and in preview responses, but only
  fallbacks are logged durably. Ordinary automatic and Manual selections are
  absent from run history.
- Settings probes Ollama health but does not expose one bounded status grammar
  for all seven registered runtimes.

## Recommended versioned settings contract

Persist one JSON value under `routing.policy`:

```json
{
  "version": 1,
  "eligibleRuntimeIds": [
    "claude-code",
    "openai-codex-app-server",
    "anthropic-direct",
    "openai-direct",
    "ollama",
    "litellm",
    "lmstudio"
  ],
  "manualDefaultRuntimeId": "claude-code",
  "automaticFallback": true
}
```

The v1 parser is strict at the API boundary and defensive at read time. It
deduplicates recognized ids, drops removed ids, preserves operator order for
stable tie-breaking, and returns a visible repair notice when stored data is
invalid. A missing value migrates in memory to the v1 default and persists on
the first routing write. New runtime ids are not silently added to an existing
operator pool; a future schema migration must make that choice explicit.

The default eligible list names all seven currently registered runtimes. This
does not claim that all seven are configured or launchable. Execution still
intersects the saved pool with current configuration, profile compatibility,
required capabilities, health, and temporary launch exclusions.

## Precedence and failure semantics

1. An explicit task or workflow runtime remains strict and wins over the pool,
   Manual default, and automatic preference. Relay never silently substitutes
   it.
2. A profile's runtime compatibility and model pin remain mandatory. A profile
   preferred runtime is used only when it is in the automatic pool and passes
   current launchability checks.
3. Manual ignores the automatic pool and uses `manualDefaultRuntimeId`
   strictly. If that runtime is unconfigured, incompatible, or unhealthy, the
   task fails visibly and tells the operator how to repair it.
4. Latency, Cost, and Quality consider only selected pool members that are
   configured, profile-compatible, capability-compatible, and healthy.
5. Automatic fallback is enabled by default and may advance only through that
   filtered order. It never applies to explicit or Manual selection. Every
   skipped candidate retains its reason in preview and the durable receipt.
6. An empty automatic pool, or a pool with no launchable member, fails visibly.
   Configuration changes never silently re-enable an excluded runtime or
   mutate credentials/models to manufacture a candidate.

## Evidence-aware preference policy

Provider identity alone is not evidence that a runtime is local, private,
free, fast, or high quality. The v1 ranker therefore separates hard filters,
strong affinity, measured/model evidence, and stable tie-breaking:

- Hard filters: pool membership, configuration, profile compatibility,
  capability requirements, health, and temporary launch exclusions.
- Strong affinity: explicit profile preference and task-content signals may
  select a matching eligible runtime, and the receipt names that signal.
- Cost: use comparable configured-model pricing only when Relay has both input
  and output rates from its pricing registry or safe provider metadata.
  Unknown-priced candidates receive no cost bonus and sort after candidates
  with known comparable pricing; they are never treated as free.
- Latency: v1 has no normalized generation-latency evidence. Transport or
  provider identity is not used as a speed claim. After affinity, candidates
  remain tied and use saved pool order; Settings labels latency evidence as
  unavailable. Connection-probe duration may be displayed as health evidence
  but is not treated as generation latency.
- Quality: v1 has no cross-provider model-quality registry. Required
  capabilities remain hard filters, but capability breadth is not called model
  quality. After affinity, candidates remain tied and use saved pool order;
  Settings labels comparable quality evidence as unavailable.

This conservative policy makes unknowns explicit and leaves a typed metadata
boundary for later observed latency or operator-approved quality evidence.

## Settings and API behavior

- The Task routing bento retains the four policy choices and adds an adjacent
  Eligible runtimes region rather than introducing provider radio buttons.
- Every registered runtime row shows selected/excluded, configured/unconfigured,
  last health result, selected model when known, capability limitations, and a
  concise reason. Unconfigured rows remain visible but cannot become launchable.
- Automatic modes show the currently filtered order, unknown-evidence notes,
  and whether fallback is enabled. Manual shows a configured-runtime default
  selector and its current health/capability state.
- Routing preference and policy save atomically through a Zod-validated API.
  Save errors remain visible and the UI does not present unsaved policy as
  active.
- Policy changes do not rewrite provider authentication, provider models,
  Ollama/compatible-runtime settings, or the Chat default. Provider edits do
  not silently change the routing preference.
- Health snapshots use a bounded, TTL-cached, all-settled probe. One slow or
  broken runtime cannot prevent the rest of Settings from rendering. A probe
  error is a named per-runtime state, not a silent omission.

## Durable execution receipt

Before launch, task dispatch writes a `runtime_selected` semantic event for
every attempt. Its bounded payload includes preference, selection mode,
effective runtime/model, selection reason, considered order, and skipped
candidates with reasons. Existing `runtime_launch_failed` and
`runtime_fallback` events remain separate. Task run history gives
`runtime_selected` a readable label and exposes the bounded detail; Monitor
retains raw diagnostics.

This reuses the existing agent-log/run-history receipt boundary and requires no
task-schema migration. The task row continues to hold only the current
effective runtime/model and fallback summary.

## Scope challenge and operator gate

### REDUCE

Persist an eligible id list and Manual default, filter execution by it, and
remove the Settings credential/model cascade. Keep present scoring and health
presentation. This is smaller but preserves misleading provider-identity
scores and weak explanations.

### PROCEED — recommended

Implement the versioned policy, strict precedence and failure rules,
evidence-aware ranking, bounded all-runtime health presentation, automatic
order/fallback preview, and durable selection receipts. Remove both directions
of the provider-configuration cascade. This fulfills G-077 without adding a
benchmarking platform or new provider administration authority.

### EXPAND

Also create latency benchmarks, an operator quality-rating registry,
task-normalized historical performance models, per-profile pools, and
per-workflow fallback graphs. These require new data collection, evaluation,
privacy, and policy decisions and are not necessary for an honest v1 pool.

The operator approved **PROCEED** on 2026-07-15 with:

1. default pool: all seven registered runtime ids, filtered dynamically;
2. Manual/default and fallback: strict Manual default, automatic-only fallback
   enabled by default;
3. unknown evidence: unknown cost gets no bonus and sorts after comparable
   known cost; unknown latency/quality remain tied in saved pool order; and
4. cascade: routing never mutates provider credentials/models or Chat defaults,
   and provider edits never silently change routing policy.

## Acceptance criteria

1. A versioned, validated policy round-trips atomically and migrates the absent,
   corrupt, duplicate, removed-id, and future-version cases without silent
   broadening.
2. Settings displays all seven runtimes with selected, configured, health,
   model, capability, and reason states at desktop and 390px; checkbox, radio,
   select, retry, and save flows are keyboard-operable with visible focus and
   system cursor behavior.
3. Automatic preview order and actual selection agree for single and multiple
   pool members, exclusions, profiles, required capabilities, health failures,
   empty/degraded pools, configuration drift, and launch fallback.
4. Explicit targets and Manual default remain strict. Profile model pins retain
   precedence. Automatic fallback never escapes the saved pool.
5. Cost/Latency/Quality fixtures distinguish known from unknown evidence and
   never infer locality, privacy, zero cost, speed, or quality from provider
   identity.
6. Every task attempt records a `runtime_selected` event; skips and fallbacks
   remain understandable in task run history and raw Monitor logs.
7. Targeted pure/API/component/resolver/dispatch/history tests pass, followed by
   type/schema/parity checks, the full suite/build, a real Next.js task smoke,
   and configured Ollama/LiteLLM/LM Studio selection-or-skip smokes.
8. Browser evidence at desktop and 390px verifies responsive layout, wrapping,
   dark/light states, empty/degraded feedback, keyboard/focus behavior, preview
   and receipt parity, and absence of cursor-switching code or instructions.

## Regression disposition

- Pure policy tests own parsing, migration, precedence inputs, stable order,
  and known/unknown ranking.
- Real-SQLite route tests own atomic persistence, error responses, and corrupt
  stored-state repair reporting.
- Execution-target matrices own all seven adapters, pool filtering, explicit
  and Manual strictness, profile/capability filters, health, empty pool, and
  temporary launch exclusions.
- Dispatch/run-history tests own selection, skip, launch-failure, and fallback
  receipts.
- Component tests own accessible editing, save/error states, provider-cascade
  removal, preview explanation, and all runtime states.
- Runtime-graph and configured-provider task smokes cross the real module graph
  required by TDR-032.

## Completion evidence — 2026-07-15

- The focused routing/settings/resolver/dispatch/history matrix passed across
  all seven runtimes. The release-profile quality gate passed 459 test files
  with 3,529 tests passing and one intentional skip; coverage ratchets,
  mutation strength (7/7 killed plus survivor control), public-boundary,
  documentation, packaging, token, harness, and runtime-graph guards were
  green. TypeScript, agent parity, diff checks, and the production build also
  passed.
- A real task executed under the running Next.js development server with
  Ollama model `hf.co/Orionfold/Advisor-GGUF:Q8_0`, returned exactly
  `G077_RUNTIME_SMOKE_OK`, and recorded the strict explicit selection receipt
  for task `b3623382-7a14-4ad0-b2a4-5f1d41b7fa4a`.
- In-app Browser checks covered desktop and 390px, light and dark, keyboard
  arrow navigation and visible focus, system-cursor-only behavior, responsive
  wrapping, live selection receipts, and a degraded provider error. The final
  layout places General-task preview before the Eligible runtimes list as
  directed by the operator.
- Fresh security review found a provider-controlled masked API-key fingerprint
  crossing the Settings/log boundary. Shared bounded diagnostics now redact
  explicit secrets, `sk-*` credential shapes, and authorization credentials;
  focused regressions prove the value is absent from UI responses, durable
  logs, task results, and rethrown launch failures.
- The final review also removed the last helper-level implicit Claude target:
  an unpinned task now enters automatic routing, while explicit and Manual
  targets remain strict. No push, publish, release, or provider mutation was
  performed.

## Not in scope

- Per-profile or per-workflow eligible pools.
- Provider credential, endpoint, model-acquisition, or model-default mutation.
- Automatic benchmarking or a cross-provider model-quality leaderboard.
- Claims that any provider identity is inherently local, private, free, fast,
  or high quality.
- Changing Chat's explicit model/runtime contract.

## Architectural references

- TDR-006: multi-runtime registry
- TDR-032: runtime registry module-cycle safety
- TDR-041: explicit compatible-runtime identities and strict overrides
- TDR-042: capability-driven provider setup
- `features/coherent-runtime-provider-setup.md`
- `features/task-runtime-ainative-mcp-injection.md`
