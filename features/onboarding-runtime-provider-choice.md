---
title: Onboarding — Runtime Provider Choice
status: completed
shipped-date: 2026-05-03
priority: P2
milestone: post-mvp
source: ideas/chat-context-experience.md Q10
dependencies: [app-shell, provider-runtime-abstraction, runtime-capability-matrix]
---

# Onboarding — Runtime Provider Choice

## Description

ainative's `DEFAULT_CHAT_MODEL` is currently hard-coded to `"haiku"` (Claude runtime). This works for the default audience but hides a meaningful tradeoff: users who care about cost want a cheap cloud model, users who care about privacy want Ollama, users who care about quality want Opus or GPT-5.4. Today they discover all of this only after landing in chat and noticing the model picker.

Per the resolution of Q10 in the ideas doc, first-launch onboarding should ask the user which model/provider they use most, and set defaults accordingly. This is a small, self-contained settings/onboarding feature that runs independently of the Phase 1 runtime-skill work. It becomes more valuable once Phase 1a/1b/1c ship because the runtimes actually differ in capability — at that point an informed default matters more.

## User Story

As a new ainative user, I want to be asked on first launch whether I prefer a cost-optimized, quality-optimized, latency-optimized, or privacy-optimized model, so my chat defaults match my actual priorities without hunting through settings.

## Technical Approach

### 1. First-launch detection

Reuse the existing onboarding/first-launch flow (likely in `src/app/layout.tsx` or a settings-bootstrap helper). If no `settings.defaultChatModel` record exists, run the onboarding modal once.

### 2. Preference prompt

Show a short radio-group modal (uses existing Sheet/Dialog patterns — remember the CLAUDE.md SheetContent padding convention `px-6 pb-6` for the body). Four choices, each mapped to a recommended model:

| Preference | Recommended default model | Runtime |
|---|---|---|
| Best quality | `claude-opus-4-6` or `gpt-5.4` | claude-code / codex |
| Lowest cost | `claude-haiku-4-5-20251001` or `gpt-5.4-mini` | claude-code / codex |
| Best privacy (local only) | First available `ollama:*` model | ollama |
| Balanced (default) | `claude-sonnet-4-6` | claude-code |

Each option shows a short capability note sourced from `runtime-capability-matrix` — e.g., "Ollama: runs locally, no filesystem tools."

### 3. Persist the preference

Store both the user's stated preference and the chosen model in `settings`:

- `settings.modelPreference`: `"quality" | "cost" | "privacy" | "balanced"`
- `settings.defaultChatModel`: the actual model id

The preference is kept alongside the model so future onboarding updates (e.g., a new model is released) can re-resolve sensibly if the user hasn't pinned a specific model themselves.

### 4. Skip / defer path

User can skip the modal with "Use default" — sets `defaultChatModel = "claude-sonnet-4-6"` (balanced) and `modelPreference = null`. Settings UI still allows changing it anytime.

### 5. Ollama availability check

If the user picks "Best privacy" and no Ollama models are discovered, show a small note ("No local models found — point ainative at your Ollama install in Settings") and fall back to `"balanced"` temporarily.

## Acceptance Criteria

- [x] On first launch (no `defaultChatModel` in settings), onboarding modal appears once — `RuntimePreferenceBootstrapper` at `src/components/onboarding/runtime-preference-bootstrapper.tsx:33-40` checks `!data.defaultModelRecorded && data.modelPreference == null`, mounted in root layout `src/app/layout.tsx:113`
- [x] Four preference options render with short capability notes — `runtime-preference-modal.tsx:37-69` (quality/balanced/cost/privacy with capabilityNote sourced from RuntimeFeatures matrix knowledge)
- [x] Selecting an option persists both `settings.modelPreference` and `settings.defaultChatModel` — `defaultPersistChoice` at `runtime-preference-modal.tsx:106-122` PUTs both to `/api/settings/chat`; route handles them independently at `src/app/api/settings/chat/route.ts:73-93`
- [x] "Skip / use default" path exists and sets the balanced default — `handleSkip` at `runtime-preference-modal.tsx:181-191` persists `{ preference: null, defaultModel: "sonnet" }`
- [x] If no Ollama models are discoverable when "Best privacy" is chosen, the user is informed and balanced is used as fallback until they configure Ollama — `resolveModelForPreference` at `runtime-preference-modal.tsx:139-155` returns `BALANCED_FALLBACK_MODEL` + a fallbackNote when discovery list is empty
- [x] Modal does not re-appear on subsequent launches — G-038 atomically writes
      the separate instance-local `onboarding.modelPreferencePromptImpression`
      marker before display, so closing mid-prompt, reload, another browser
      session, or a server restart cannot recur; legacy Confirm/Skip/default
      rows remain grandfathered
- [x] Settings UI exposes both `modelPreference` and `defaultChatModel`, editable independently — `ChatSettingsSection` at `src/components/settings/chat-settings-section.tsx:115-138` adds a "Model preference" Select alongside the existing "Default Model" Select; each has its own onChange that PUTs only that field
- [x] Modal follows the project's Sheet padding convention (`px-6 pb-6` in body) — `runtime-preference-modal.tsx:208,221,255` apply `px-6` to body content + footer (the spec mentions Sheet but the implementation uses Dialog; the same padding discipline is preserved)

## Verification

- 10/10 settings helper tests at `src/lib/settings/__tests__/model-preference.test.ts` (coercion, persistence, skip-marker semantics, `hasSeenModelPreferencePrompt`).
- 7/7 modal tests at `src/components/onboarding/__tests__/runtime-preference-modal.test.tsx` (4-option render, default=balanced→sonnet, quality→opus, cost→haiku, skip→null+sonnet, privacy with discovered ollama→`ollama:*` id, privacy fallback note + balanced model + does-not-close-until-dismissed).
- 6/6 chat-session-provider tests still pass against the new GET shape (`{ defaultModel, defaultModelRecorded, modelPreference }`).
- 8/8 providers-runtimes-section tests still pass (existing PUT `{ defaultModel }` only — backward compatible).
- 36/36 settings-touching neighbors (instance/__tests__/settings, chat/tools/__tests__/settings-tools) still pass.
- `npx tsc --noEmit` clean project-wide.

### G-038 verification — 2026-07-16

- The root bootstrapper now calls one atomic POST claim rather than inferring
  first display from model/default choice. The SQLite transaction checks the
  new impression marker plus legacy `chat.defaultModel` and
  `chat.modelPreference` rows, then inserts exactly once under the active
  `RELAY_DATA_DIR`.
- 33 focused prompt/helper/route tests cover first claim, repeat claim, legacy
  Confirm/Skip/default compatibility, React Strict Mode replay, named storage
  failure, first-browser display, and second-browser suppression. The broader
  settings/onboarding neighborhood passed 207 tests; TypeScript passed.
- Real in-app browser evidence used a fresh isolated data directory. The first
  page displayed `Pick your default chat model`; reload without choosing,
  another tab, and a process restart against the same directory each exposed
  zero dialogs. SQLite contained only the timestamped impression marker and no
  model/default choice rows. Browser warning/error logs were empty.

## Design Decisions

- **DD-1: Persist user-stated preference even when privacy fallback hits.** When the privacy option is chosen but no Ollama models are discoverable, we persist `preference: "privacy"` paired with `defaultModel: "sonnet"`. The mismatch is intentional — the Settings UI later surfaces it (Best privacy / Sonnet) so the user knows to install Ollama. The alternative (downgrading both to balanced) loses user intent. Rejected because "until they configure Ollama" in the spec implies the preference is sticky.

- **DD-2: Capability notes inlined in the modal, not generated from the matrix.** The four preference→note pairs are short, fixed, and rarely rotated. A generator helper that maps `RuntimeFeatures` flags to prose would add complexity without proportional value. Per principle #6 (DRY with judgment), extract on third use, not first. If a fifth preference is added or notes need to vary by runtime catalog state, refactor then.

- **DD-3: Empty-string write as the "skip marker".** `setModelPreference(null)` writes the literal `""` to `chat.modelPreference` so the row exists but coerces back to null on read. This lets the bootstrapper distinguish "never asked" (no row) from "asked and skipped" (row present, preference null). Same pattern as the route's `defaultModelRecorded` flag — both surface raw existence separately from coerced value.

- **DD-4: Modal refuses outside-click and Escape close.** Exit must go through Confirm or Skip — both write a setting that suppresses re-prompt. If we allowed outside-click close without writing, the modal would re-appear on every page load until the user actually picked something. `showCloseButton={false}` + the empty-on-close handler enforce this.

- **DD-5: Allow `ollama:*` model IDs in the route validator.** The original `/api/settings/chat` PUT validator rejected anything not in `CHAT_MODELS`, which silently broke the privacy path (Ollama models live under the `ollama:*` namespace and are discovered dynamically). Added a `validOllamaModel = body.defaultModel.startsWith("ollama:")` check. This was a latent bug for users picking Ollama from the existing chat-settings-section dropdown; the privacy preference exposed it.

- **DD-6: Claim the impression before display, independently of choice.** G-038
  adds a dedicated POST boundary backed by a synchronous SQLite transaction.
  Only the winning browser opens the modal. A timestamped settings row keeps
  the contract instance-local without a migration, while existing choice rows
  prevent upgraded configured instances from being prompted. Marker failure
  returns `MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED`, keeps the modal
  closed, logs the named server failure, and shows a retryable Settings-directed
  error toast instead of silently repeating the prompt.

## Scope Boundaries

**Included:**
- First-launch preference modal and persistence
- Capability-note text sourced from `runtime-capability-matrix`
- Settings UI surfaces for both preference and model

**Excluded:**
- Multi-step onboarding beyond model choice (other onboarding is tracked elsewhere)
- Automatic Ollama installation/discovery — relies on existing `ollama-runtime-provider` behavior
- Re-prompting on model catalog changes (future enhancement)
- A/B testing of defaults

## References

- Source: `ideas/chat-context-experience.md` Q10 answer
- Depends on: `runtime-capability-matrix` (for capability notes), `provider-runtime-abstraction`, `app-shell`
- MEMORY.md: "SheetContent body padding" convention
- Existing code: `src/app/layout.tsx`, `src/lib/settings.ts` (if present), `src/components/shared/app-sidebar.tsx`
