import type { ComposePlan } from "./types";

function buildGenericHint(plan: ComposePlan): string {
  const lines = [
    "",
    "## App Compose Hint (M4.5 generic, 2026-05-01)",
    "This is a compose request — MUST NOT invoke the Skill tool (no brainstorming, ainative-app, product-manager). Compose directly via primitive tools.",
    'Pick a kebab-case slug (e.g. "habit-tracker"). Use `<slug>--<artifact>` ids for create_profile/create_blueprint. Pass `appId: "<slug>"` on every create_table/create_schedule — the appId MUST NOT contain `--`.',
  ];
  if (plan.integrationNoun && !plan.repositoryPublishIntent) {
    lines.push(
      `Note: the user mentioned \`${plan.integrationNoun}\`. Composition primitives can't make external API calls — compose the app structure (profile + blueprint + tables + schedule) and tell the user to scaffold a separate plugin (e.g. "i need a tool that pulls my ${plan.integrationNoun} data") if they need ${plan.integrationNoun} access. Do NOT scaffold a plugin in this turn.`
    );
  }
  lines.push(`Rationale: ${plan.rationale}.`);
  lines.push(
    "Materialize the app with create_profile, create_blueprint, create_table, and create_schedule as appropriate; use one app id consistently."
  );
  if (plan.packIntent) {
    lines.push(
      "After every primitive has been created successfully, call `export_app_as_pack` with that app id and `includeSampleData:false`."
    );
  }
  if (plan.repositoryPublishIntent) {
    lines.push(
      "Then call `list_pack_publish_targets`. If a github-repo target exists, call `publish_app_as_pack` with confirm:true. If none exists, do not request a token in chat; tell the user to configure the Pack repository panel on `/apps/<app-id>#pack-repository-panel`."
    );
  }
  lines.push("");
  return lines.join("\n");
}

function buildPrimitiveMatchedHint(plan: ComposePlan): string {
  const parts: string[] = [
    "",
    "## App Composition Directive (M4.5 planner, 2026-04-21)",
    "",
    "CRITICAL: The user's message has been CLASSIFIED as an app-composition",
    "request. This is a deterministic routing decision, NOT a creative task.",
    "",
    "MUST NOT invoke the Skill tool (brainstorming, ainative-app, product-manager,",
    "or any other skill) for this turn. Composition is handled by direct tool",
    "calls — not by planning or brainstorming.",
    "",
    "Recommended composition:",
    "",
    `- Profile: \`${plan.profileId}\` (existing builtin — list_profiles to confirm)`,
    `- Blueprint: \`${plan.blueprintId}\` (existing builtin — list_blueprints to confirm)`,
  ];

  if (plan.tables && plan.tables.length > 0) {
    parts.push("");
    parts.push("Tables:");
    for (const table of plan.tables) {
      const colDesc = table.columns
        .map((c) => `${c.name} (${c.type})`)
        .join(", ");
      parts.push(`- \`${table.name}\` with columns: ${colDesc}`);
    }
  }

  if (plan.schedule) {
    parts.push("");
    parts.push(
      `Schedule: \`${plan.schedule.cron}\` — ${plan.schedule.description}`
    );
  }

  parts.push("");
  parts.push(`Rationale: ${plan.rationale}.`);
  parts.push("");
  parts.push("Your next actions should be:");
  parts.push(
    "1. Call `create_profile` with a DOUBLE-HYPHEN namespaced id: `<app-id>--<artifact-id>` (e.g. `weekly-reading-list--manager`). The `--` separator is REQUIRED for the UI to recognize the composition and for the profile to be stored in the data-dir-scoped location."
  );
  parts.push(
    "2. Call `create_blueprint` with the SAME `<app-id>--<artifact-id>` format (e.g. `weekly-reading-list--synthesis`)."
  );
  if (plan.tables && plan.tables.length > 0) {
    parts.push(
      "3. Call `create_table` for each proposed table. Table names do not need the `--` prefix, BUT you MUST pass `appId: '<app-id>'` (same slug as step 1) so the table is linked to the app's project and joined to the manifest."
    );
    parts.push(
      "4. If a schedule is listed below, call `create_schedule` and ALSO pass `appId: '<app-id>'` plus `blueprintId: '<app-id>--<blueprint>'` so the portable schedule joins the app and names the blueprint it runs."
    );
    parts.push("5. Respond to the user summarizing what was composed.");
  } else {
    parts.push(
      "3. If a schedule is listed below, call `create_schedule` and pass `appId: '<app-id>'` plus `blueprintId: '<app-id>--<blueprint>'` so the portable schedule names the blueprint it runs."
    );
    parts.push("4. Respond to the user summarizing what was composed.");
  }
  parts.push("");
  if (plan.packIntent) {
    parts.push(
      "PACK OUTPUT: after all primitive tool calls succeed, call `export_app_as_pack(appId, includeSampleData:false)`. Do not include live rows unless the user explicitly requested sample data."
    );
  }
  if (plan.repositoryPublishIntent) {
    parts.push(
      "REPOSITORY OUTPUT: call `list_pack_publish_targets(appId)`. If a github-repo target exists, call `publish_app_as_pack(appId, targetId, confirm:true, includeSampleData:false)`. If no target exists, never ask for a token in chat; link `/apps/<app-id>#pack-repository-panel`."
    );
  }
  parts.push("");
  parts.push(
    "MUST call `create_profile`, `create_blueprint`, and any `create_table`",
    "tools listed above BEFORE writing any prose response. The chat UI renders",
    "the composition card from those tool calls — no tool calls means no card."
  );
  parts.push("");
  parts.push(
    "Edge case: if the user's stated intent clearly differs from this",
    "classification (e.g. they're asking a question rather than requesting",
    "composition), then prefer their stated intent. But do NOT invoke the",
    "Skill tool to resolve the ambiguity — just respond in prose directly."
  );
  parts.push("");

  return parts.join("\n");
}

export function buildCompositionHint(plan: ComposePlan): string {
  if (plan.kind === "generic") return buildGenericHint(plan);
  return buildPrimitiveMatchedHint(plan);
}
