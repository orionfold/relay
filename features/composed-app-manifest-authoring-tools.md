---
title: Composed App Manifest Authoring — Chat Tools for view: Field
status: completed
shipped-date: 2026-05-03
priority: P3
milestone: post-mvp
source: ideas/composed-apps-domain-aware-view.md
dependencies: [composed-app-manifest-view-field, composed-app-auto-inference-hardening, chat-app-builder]
---

# Composed App Manifest Authoring — Chat Tools for `view:` Field

## Description

The strategy doc closes Phase 5 with "Manifest authoring UX (the chat tools that emit/edit `view:` for end users)." Phases 1-4 made the `view:` field exist and made it drive the dispatcher. Phase 5's hardening made auto-inference production-ready. This feature adds the *chat-side authoring loop* so end users can compose apps with explicit view configuration without editing YAML by hand.

Today, when a user types *"build me a habit tracker"* in chat, the planner (`nl-to-composition-v1`) fires `AppMaterializedCard` and the resulting manifest has no `view:` field — auto-inference handles layout. That's correct for the default case. This feature handles the **override** case: a user who wants a Tracker layout for an app that auto-infers as Workflow Hub, or a user who wants to customize KPI tiles, or a user who wants to bind a specific table as the hero.

Three new chat tools land:

1. **`set_app_view_kit(appId, kit)`** — lock the kit selection (overrides auto-inference).
2. **`set_app_view_bindings(appId, bindings)`** — set hero/secondary/cadence/runs bindings.
3. **`set_app_view_kpis(appId, kpis)`** — declare 1-6 KPI tiles with discriminated-union sources.

Each tool is a thin wrapper that loads the manifest, mutates `view`, validates the result against `ViewSchema` (strict), and writes back atomically. The chat surface gets a small inline `<AppViewEditorCard/>` that the LLM can render to ask the user "Switch to Ledger layout?" with confirm/cancel.

This is **P3 / nice-to-have**: every starter and most user-authored apps work fine on auto-inference. This feature exists for the power user who wants explicit control.

## User Story

As a power user whose habit-tracker app auto-infers as `tracker` but who wants `workflow-hub` because they have multiple blueprints, I want to type *"switch to workflow hub layout"* in chat and have ainative update the manifest atomically without me touching YAML.

As a user customizing KPIs on my finance app, I want to add a "savings rate" tile via chat and have it appear at the top of the Ledger view immediately.

## Technical Approach

### Three new chat tools

**`src/lib/chat/tools/app-view-tools.ts`**

```ts
export const setAppViewKitTool = {
  name: "set_app_view_kit",
  description: "Set the explicit view kit for a composed app. Pass 'auto' to revert to inference.",
  inputSchema: z.object({
    appId: z.string(),
    kit: KitId,  // imported from src/lib/apps/registry.ts
  }),
  handler: async ({ appId, kit }, ctx) => {
    const app = await getApp(appId);
    if (!app) throw new ToolError("App not found", { code: "APP_NOT_FOUND" });
    const newManifest = {
      ...app.manifest,
      view: { ...(app.manifest.view ?? {}), kit },
    };
    const validated = AppManifestSchema.parse(newManifest);
    await writeAppManifest(appId, validated);
    return { ok: true, kit };
  },
};

export const setAppViewBindingsTool = {
  name: "set_app_view_bindings",
  inputSchema: z.object({
    appId: z.string(),
    bindings: ViewSchema.shape.bindings,  // reuse the existing Zod sub-schema
  }),
  handler: async ({ appId, bindings }, ctx) => { /* mutate, validate, write */ },
};

export const setAppViewKpisTool = {
  name: "set_app_view_kpis",
  inputSchema: z.object({
    appId: z.string(),
    kpis: z.array(KpiSpec),
  }),
  handler: async ({ appId, kpis }, ctx) => { /* mutate, validate, write */ },
};
```

All three tools:
- Load the current manifest, do a deep-clone, mutate `view`, validate via the existing strict Zod schemas, write back via atomic temp-file + rename.
- Fire the existing `ainative-apps-changed` event so `useApps()` and the dispatcher cache bust.
- Return the new effective kit (so the LLM can confirm to the user).

### Chat UI surface: `<AppViewEditorCard/>`

**`src/components/chat/app-view-editor-card.tsx`** — a card the LLM can render via existing tool-result-rendering pattern:

```tsx
type Props = {
  appId: string;
  currentKit: KitId;
  proposedKit?: KitId;
  proposedBindings?: ViewBindings;
  proposedKpis?: KpiSpec[];
  rationale?: string;  // why the LLM thinks this change helps
};
```

The card shows:
- Current kit name + a one-line description
- Proposed change (highlighted)
- Rationale from the LLM (1-2 sentences)
- Confirm / Cancel buttons; Confirm calls the appropriate tool

Renders inside the chat message stream like the existing `AppMaterializedCard` and `ExtensionFallbackCard`.

### LLM tool-emission patterns

These tools are exposed to the chat planner. The planner gets nudged toward them when:

- The user message mentions "switch layout", "change view", "add KPI", "show me as", "use [kit name] layout"
- The user message references an app + a view-shaped intent ("on my habit tracker, show me a finance dashboard instead")

Add a `buildViewEditingHint(plan, appContext)` to the existing planner (`src/lib/chat/planner/`), parallel to the existing `buildCompositionHint`. When the classifier detects view-editing intent, the system prompt is augmented with the available tools and current app context.

### Inference trace integration (UX shortcut)

The diagnostics page from `composed-app-auto-inference-hardening` includes a "Copy as `view:` field" button. Wire that button to *also* offer "Apply via chat" — opens the chat with a pre-filled message that calls `set_app_view_kit` + `set_app_view_bindings` for the user.

### Permissions and safety

- These tools mutate user-authored manifests. They're allowed by default (analogous to the existing app-mutation tools); no new permission preset needed.
- Strict Zod validation catches schema violations before write (e.g., LLM-hallucinated KPI source kinds fail loudly).
- Atomic temp-file + rename prevents partial writes from corrupting the manifest.
- A "View manifest" sheet in the app's header (already shipped in `composed-app-view-shell`) shows the post-write state immediately.

## Acceptance Criteria

- [x] **AC #1** Three chat tools land: `set_app_view_kit`, `set_app_view_bindings`, `set_app_view_kpis` — registered in the chat tools registry — `src/lib/chat/tools/app-view-tools.ts:69-201` (3 `defineTool` calls), wired in `src/lib/chat/ainative-tools.ts:30,71` (import + collectAllTools spread). Chat-tool count went 97 → 100 (spec said "92 → 95" — baseline was stale; the actual jump is +3 over the current 97).
- [x] **AC #2** All three tools validate inputs against the strict `ViewSchema`; invalid inputs return a `ToolError` with clear message — input shapes use `KitIdSchema` / `ViewSchema.shape.bindings` / `KpiSpecSchema` directly so any out-of-enum value (kit id, KPI source kind) fails at the SDK validation layer; mid-write rejections (post-`writeAppManifest`'s schema parse) return the parse error message via `err()`. Test: `app-view-tools.test.ts` — "rejects > 6 kpis at the input boundary"; `write-app-manifest.test.ts` — "rejects a schema-violating manifest before touching disk".
- [x] **AC #3** Each tool fires `ainative-apps-changed` after a successful write — `dispatchAppsChangedFromTool()` at `app-view-tools.ts:39-46` called by all three handlers after `writeAppManifest`. Cache invalidation is also done synchronously inside `writeAppManifest` via `invalidateAppsCache()` at `registry.ts:455`.
- [x] **AC #4** `<AppViewEditorCard/>` renders in the chat message stream with current kit, proposed kit, rationale, confirm/cancel — `src/components/chat/app-view-editor-card.tsx`. Tests: `__tests__/app-view-editor-card.test.tsx` — 7 cases including kit / bindings / kpis change rendering.
- [x] **AC #5** Confirm button on the card calls the right tool with the right args; cancel discards — confirm/cancel callbacks are injected via props (`onConfirm`, `onCancel`); the card transitions to "Applied"/"Cancelled"/"Failed" states based on the callback outcome. Tests pin the contract for both paths plus error-on-throw and double-click guard.
- [x] **AC #6** Planner detects view-editing intent and augments system prompt with `buildViewEditingHint`; classifier tests cover ≥4 view-editing user messages — `src/lib/chat/planner/view-editing-hint.ts` (classifier + hint builder); wired into `src/lib/chat/engine.ts:343-352` parallel to `buildCompositionHint`. Tests: `view-editing-hint.test.ts` — 6 detection cases (kit phrase, render-as, add-KPI, use-as-hero, unrelated message, mixed-intent precedence).
- [ ] **AC #7** *DEFERRED* — The diagnostics page now exists through G-009, but "Apply via chat" remains outside that goal's copy-only, non-mutating contract. Treat this as an unpromoted follow-up that requires separate grooming before implementation; the shipped page intentionally does not imply that the badge is a kit switcher.
- [x] **AC #8** Worked-example test: classifier+hint produce the right tool-call shape for "switch my habit-tracker to workflow-hub layout" — `view-editing-hint.test.ts` "worked example: spec AC #8" pins `intent: "kit"`, `appHint: "habit-tracker"`, and that the hint mentions both `set_app_view_kit` and `workflow-hub`. End-to-end "dispatcher renders Workflow Hub on next visit" is covered by the kit-resolution path in the existing dispatcher tests, which run on the persisted manifest that `set_app_view_kit` writes.
- [x] **AC #9** Atomic write: a tool failure mid-write does not corrupt the manifest file — `writeAppManifest` at `registry.ts:425-455` uses temp-file (`<path>.<pid>.<ts>.tmp`) + `renameSync`, with `unlinkSync` cleanup on rename failure. Test: `write-app-manifest.test.ts` — "does not leave a .tmp file behind when rename fails" pre-injects a `renameSync` failure and asserts (a) original manifest unchanged on disk, (b) no `.tmp` file orphaned in the app dir.
- [x] **AC #10** Documentation in `ainative-app` skill updated with examples of view-editing prompts — `.claude/skills/ainative-app/SKILL.md` "View-Editing (override auto-inferred layout)" section appended with 3 tool descriptions, 4 trigger phrases, and a note that the path is for power users only.

## Verification

- 5/5 atomic-write tests pass (`write-app-manifest.test.ts`).
- 6/6 chat-tool tests pass (`app-view-tools.test.ts`).
- 13/13 planner-hint classifier tests pass (`view-editing-hint.test.ts`).
- 7/7 card render+interaction tests pass (`app-view-editor-card.test.tsx`).
- 656/657 tests pass across 70 files in `src/lib/apps src/lib/chat src/components/chat` (1 pre-existing skip; 0 regressions).
- `npx tsc --noEmit` clean project-wide.

## Design Decisions

- **DD-1: Card built standalone; chat-message.tsx auto-render integration deferred.** The card is fully functional with `onConfirm`/`onCancel` callbacks and exhibits all 5 visual states (idle / pending / applied / cancelled / failed). What is NOT yet wired: an engine-side detector that converts a successful `set_app_view_*` tool call into chat-message metadata that auto-mounts the card. The existing `composedApp` and `extensionFallback` metadata paths are precedents — adding a `viewEditor` metadata path is straightforward but requires an engine.ts change. Deferred because (a) the LLM can already call the tools directly without the card, (b) the card itself is reusable for any future surface, and (c) this is a P3 feature for power users where a tool-result text confirmation is acceptable interim UX.
- **DD-2: Capability validation via Zod sub-schema reuse.** `ViewSchema.shape.bindings` is passed directly to `defineTool` as the `bindings` argument's schema — keeps the tool surface in lock-step with the strict schema. If a future schema rotation tightens or extends the bindings shape, the chat tool inherits the change automatically with no duplicate edit. Same applies to `KitIdSchema` and `KpiSpecSchema`.
- **DD-3: Atomic write helper added to the registry, not the chat tool.** `writeAppManifest` lives in `src/lib/apps/registry.ts` next to `getApp` so any future caller (a settings UI, a CLI command, a plugin) gets the same atomic guarantees. The chat tools are thin wrappers — load + mutate + delegate.
- **DD-4: Most-specific intent wins in the classifier.** A message like "switch the layout — actually just add a KPI tile" matches both kit and kpis keywords; the classifier returns `intent: "kpis"` because KPI mutations are more specific than kit mutations and the user's *latest* utterance carries more signal. Pinned by test `KPI keyword wins over kit keyword in mixed message`.
- **DD-5: View-editing hint is independent of the compose verdict.** A user mid-conversation can say "switch this to ledger view" without re-triggering composition. Engine.ts injects both hints when applicable rather than treating them as exclusive verdict kinds. Lower blast radius than a classifier refactor; if the categories grow to 4-5, revisit.
- **DD-6: Mutation tools replace, not merge, for bindings and kpis.** The bindings tool replaces the entire bindings object (preserving `kit` and `hideManifestPane`), and the kpis tool replaces the entire `kpis` array (preserving the rest of `bindings`). The hint reminds the LLM to "pass the COMPLETE object". Replace-not-merge is simpler to reason about and avoids the trap of partial-mutation surprises ("I removed the secondary binding, why is it still there?").

## Scope Boundaries

**Included:**
- 3 new chat tools for view editing
- `<AppViewEditorCard/>` chat surface
- Planner hint for view-editing intents
- "Apply via chat" wiring from the diagnostics page
- Updated `ainative-app` skill docs

**Excluded:**
- LLM-generated KPI suggestions ("here are 4 useful KPIs for your app") — pure rule-based suggestions only in this feature
- A full visual layout editor (drag-drop bento) — out of scope; chat is the authoring surface
- New kit ids or new KPI source kinds (those require code changes per strategy)
- Multi-user collaboration on view editing (single-user only)
- Undo/redo of view changes (the manifest sheet shows current state; users can re-edit if needed)

## References

- Source: `ideas/composed-apps-domain-aware-view.md` — section 8 (Phase 5 — Polish, "Manifest authoring UX"), section 13 shard #7
- Related features: `composed-app-manifest-view-field` (defines the schema this writes to), `composed-app-auto-inference-hardening` (provides the diagnostics integration), `chat-app-builder` (existing chat-driven app authoring), `nl-to-composition-v1` (existing planner pattern)
- Reference: existing tool registration in `src/lib/chat/tools/`, `AppMaterializedCard` and `ExtensionFallbackCard` for chat surface patterns
- Anti-pattern reminders: tools never bypass `ViewSchema` validation; manifest writes are atomic; no escape hatches that allow arbitrary YAML
