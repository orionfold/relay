// Zero-dependency leaf module: shared constants for the apps-change event.
// Kept import-free on purpose so both the client hook (`use-apps.ts`, which
// pulls React) and the server-side chat tool (`app-view-tools.ts`, reachable
// from the runtime tool catalog via `ainative-tools.ts`) can depend on it
// without dragging each other's runtime across the client/server boundary —
// the module-load coupling the CLAUDE.md smoke-budget rule fences against.

/**
 * Name of the CustomEvent dispatched (on undo / materialize) to tell the apps
 * UI to refresh. Dispatcher and listener must agree on this exact string, so
 * it is defined once here. Renamed from the pre-rebrand `ainative-apps-changed`;
 * the event is in-process only (fired and handled within one page load, never
 * persisted), so no legacy alias is needed.
 */
export const APPS_CHANGED_EVENT = "relay-apps-changed";
