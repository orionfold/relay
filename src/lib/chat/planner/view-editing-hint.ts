/**
 * View-editing intent detection + planner hint.
 *
 * Companion to `composition-hint.ts`. Where composition handles "build me an
 * X app", view-editing handles "switch X to layout Y" / "add KPI Z" /
 * "use the workflow-hub view for X". When an intent is detected, the chat
 * engine appends a short directive to the system prompt naming the three
 * `set_app_view_*` tools and the candidate kit ids, so the LLM is nudged
 * toward the right tool calls instead of free-form prose.
 *
 * Design choice: regex-based classifier rather than full LLM intent
 * parsing. View-editing vocabulary is narrow ("layout", "view", "kit",
 * "kpi", "switch", "change"); a regex catches the common cases cheaply.
 * False positives are tolerable — the LLM will simply ignore the hint
 * when it doesn't apply.
 */

export type ViewEditingIntent = "kit" | "bindings" | "kpis";

export interface ViewEditingDetection {
  detected: boolean;
  intent?: ViewEditingIntent;
  /** App id the user mentioned, if a `<word>-tracker|hub|coach|app|dashboard` slug is present. */
  appHint?: string;
}

const KIT_KEYWORDS = [
  "switch.*layout",
  "change.*layout",
  "use.*layout",
  "switch.*view",
  "change.*view",
  "switch.*to.*workflow.hub",
  "switch.*to.*tracker",
  "switch.*to.*ledger",
  "switch.*to.*inbox",
  "switch.*to.*research",
  "switch.*to.*coach",
  "use.*workflow.hub.*kit",
  "use.*tracker.*kit",
  "show.*me.*as",
  "render.*as",
  "use.*kit",
  "set.*kit",
  "lock.*kit",
] as const;

const KPI_KEYWORDS = [
  "add.*kpi",
  "add.*tile",
  "remove.*kpi",
  "kpi.*tile",
  "savings.*rate",
  "show.*metric",
  "add.*metric",
  "track.*metric",
] as const;

const BINDING_KEYWORDS = [
  "set.*hero",
  "use.*as.*hero",
  "set.*secondary",
  "bind.*table",
  "bind.*blueprint",
  "show.*table.*at.*top",
  "use.*table.*as.*hero",
] as const;

function anyMatch(normalized: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => new RegExp(p, "i").test(normalized));
}

/**
 * Detect view-editing intent in a user message. Returns the most-specific
 * intent if multiple categories match (kpis > bindings > kit) so that a
 * message like "add a savings-rate KPI to the ledger view" classifies as
 * "kpis" rather than the more generic "kit".
 */
export function detectViewEditingIntent(
  message: string
): ViewEditingDetection {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return { detected: false };

  // Most-specific first: kpi keywords beat binding keywords beat kit keywords.
  const isKpi = anyMatch(normalized, KPI_KEYWORDS);
  const isBinding = anyMatch(normalized, BINDING_KEYWORDS);
  const isKit = anyMatch(normalized, KIT_KEYWORDS);

  if (!isKpi && !isBinding && !isKit) {
    return { detected: false };
  }

  let intent: ViewEditingIntent;
  if (isKpi) intent = "kpis";
  else if (isBinding) intent = "bindings";
  else intent = "kit";

  // Pull out a slug-like app reference. We accept any kebab-case noun
  // ending in tracker/hub/coach/app/dashboard/inbox/loop. The classifier
  // does not validate against the app registry — that's the LLM's job
  // when it actually calls the tool.
  const appMatch = normalized.match(
    /\b([a-z][a-z0-9]*(?:-[a-z0-9]+)*-(?:tracker|hub|coach|app|dashboard|inbox|loop))\b/
  );
  return {
    detected: true,
    intent,
    appHint: appMatch?.[1],
  };
}

/**
 * Build the planner hint string appended to the system preamble when
 * `detectViewEditingIntent` fires. The hint names the three view-editing
 * tools, the seven kit ids, and (when present) the user-mentioned app id.
 *
 * Kept short on purpose — the LLM already has the tool schemas via the
 * tool registry; the hint just nudges toward using them rather than
 * free-form advice.
 */
export function buildViewEditingHint(
  detection: ViewEditingDetection
): string {
  if (!detection.detected) return "";

  const lines = [
    "",
    "## View-Editing Hint (composed-app-manifest-authoring-tools, 2026-05-03)",
    "",
    "The user's message has been classified as a view-editing intent for a composed app.",
    "Use the three view-editing chat tools (do NOT hand-edit YAML, do NOT invoke a skill):",
    "",
    "- `set_app_view_kit(appId, kit)` — set the explicit layout kit. Valid kits: auto, tracker, coach, inbox, research, ledger, workflow-hub.",
    "- `set_app_view_bindings(appId, bindings)` — set hero/secondary/cadence/runs bindings to manifest primitives.",
    "- `set_app_view_kpis(appId, kpis)` — declare 1-6 KPI tiles with discriminated source kinds.",
    "",
  ];

  if (detection.appHint) {
    lines.push(
      `Detected app reference: \`${detection.appHint}\`. Confirm it exists via \`list_apps\` before mutating; if the slug differs, use the correct one.`
    );
    lines.push("");
  }

  switch (detection.intent) {
    case "kit":
      lines.push(
        "Primary tool for this turn: `set_app_view_kit`. After the call, render an `AppViewEditorCard` with the new kit name + a one-line rationale."
      );
      break;
    case "bindings":
      lines.push(
        "Primary tool for this turn: `set_app_view_bindings`. Pass the COMPLETE bindings object — the tool replaces, not merges. Preserve any existing hero/secondary/cadence/runs the user did not mention."
      );
      break;
    case "kpis":
      lines.push(
        "Primary tool for this turn: `set_app_view_kpis`. Pass the COMPLETE kpis array (1-6 tiles). Use `tableSum`, `tableCount`, `tableLatest`, `blueprintRunCount`, `scheduleNextFire`, or `tableSumWindowed` source kinds. Format defaults to `int` — set to `currency`/`percent`/`duration`/`relative` when appropriate. For comparable windowed KPIs, explicitly set `semantics.favorable` to `higher`, `lower`, `closer-to-zero`, or `neutral`; never infer favorability from the KPI label or stored sign."
      );
      break;
  }
  lines.push("");

  return lines.join("\n");
}
