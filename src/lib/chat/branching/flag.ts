import { isChatBranchingEnabled } from "@/lib/config/env";

/**
 * chat-conversation-branches v1 — feature flag.
 *
 * The schema and data-layer changes shipped behind this flag are always
 * present and tested (so they don't bit-rot), but the UI surfaces — the
 * "Branch from here" action, branch tree tab, and ⌘Z/⌘⇧Z keybindings —
 * only render when this returns `true`.
 *
 * Default-off until v1 validation completes. Flip to `true` per-developer
 * via `RELAY_CHAT_BRANCHING=true` in `.env.local`. Flag check is
 * synchronous so it can be used inline in render paths.
 *
 * The flag read is centralized in `@/lib/config/env`; this wrapper keeps the
 * feature-named call site (`isBranchingEnabled`) the rest of the app imports.
 *
 * See `features/chat-conversation-branches.md`.
 */
export function isBranchingEnabled(): boolean {
  return isChatBranchingEnabled();
}
