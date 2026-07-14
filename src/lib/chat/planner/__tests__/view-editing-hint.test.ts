import { describe, expect, it } from "vitest";
import {
  detectViewEditingIntent,
  buildViewEditingHint,
} from "../view-editing-hint";

describe("detectViewEditingIntent", () => {
  it("detects 'switch <app> to <kit> layout' as kit intent", () => {
    const r = detectViewEditingIntent(
      "switch my habit-tracker to workflow-hub layout"
    );
    expect(r.detected).toBe(true);
    expect(r.intent).toBe("kit");
    expect(r.appHint).toBe("habit-tracker");
  });

  it("detects 'render as <kit>' as kit intent", () => {
    const r = detectViewEditingIntent("render as ledger");
    expect(r.detected).toBe(true);
    expect(r.intent).toBe("kit");
  });

  it("detects 'add a savings rate KPI' as kpis intent", () => {
    const r = detectViewEditingIntent(
      "add a savings rate KPI to my finance-tracker"
    );
    expect(r.detected).toBe(true);
    expect(r.intent).toBe("kpis");
    expect(r.appHint).toBe("finance-tracker");
  });

  it("detects 'use this table as hero' as bindings intent", () => {
    // Use a kebab-case slug — the appHint extractor matches the real app
    // id format (e.g. `coach-app`, `habit-tracker`), not space-separated
    // English. The classifier tolerates either; only the slug-shaped
    // reference is captured into appHint.
    const r = detectViewEditingIntent(
      "use this table as hero on my coach-app"
    );
    expect(r.detected).toBe(true);
    expect(r.intent).toBe("bindings");
    expect(r.appHint).toBe("coach-app");
  });

  it("returns detected=false for unrelated messages", () => {
    expect(detectViewEditingIntent("create a new app").detected).toBe(false);
    expect(detectViewEditingIntent("what's the weather").detected).toBe(false);
    expect(detectViewEditingIntent("").detected).toBe(false);
  });

  it("KPI keyword wins over kit keyword in mixed message", () => {
    // "switch ... layout" matches kit; "add KPI" matches kpis.
    // Spec rule: most-specific wins → kpis.
    const r = detectViewEditingIntent(
      "switch the layout — actually just add a KPI tile for streaks"
    );
    expect(r.intent).toBe("kpis");
  });
});

describe("buildViewEditingHint", () => {
  it("returns empty string when no detection", () => {
    expect(buildViewEditingHint({ detected: false })).toBe("");
  });

  it("includes the three tool names in the hint", () => {
    const hint = buildViewEditingHint({
      detected: true,
      intent: "kit",
    });
    expect(hint).toContain("set_app_view_kit");
    expect(hint).toContain("set_app_view_bindings");
    expect(hint).toContain("set_app_view_kpis");
  });

  it("requires explicit KPI favorability semantics for comparable windows", () => {
    const hint = buildViewEditingHint({ detected: true, intent: "kpis" });
    expect(hint).toContain("semantics.favorable");
    expect(hint).toContain("closer-to-zero");
    expect(hint).toContain("never infer favorability");
  });

  it("names the seven kit ids", () => {
    const hint = buildViewEditingHint({ detected: true, intent: "kit" });
    for (const kit of [
      "auto",
      "tracker",
      "coach",
      "inbox",
      "research",
      "ledger",
      "workflow-hub",
    ]) {
      expect(hint).toContain(kit);
    }
  });

  it("calls out the primary tool for the detected intent", () => {
    expect(buildViewEditingHint({ detected: true, intent: "kit" })).toMatch(
      /Primary tool for this turn: `set_app_view_kit`/
    );
    expect(
      buildViewEditingHint({ detected: true, intent: "bindings" })
    ).toMatch(/Primary tool for this turn: `set_app_view_bindings`/);
    expect(buildViewEditingHint({ detected: true, intent: "kpis" })).toMatch(
      /Primary tool for this turn: `set_app_view_kpis`/
    );
  });

  it("surfaces the detected app slug when present", () => {
    const hint = buildViewEditingHint({
      detected: true,
      intent: "kit",
      appHint: "habit-tracker",
    });
    expect(hint).toContain("habit-tracker");
    expect(hint).toContain("list_apps");
  });

  it("does not include an app reference line when none detected", () => {
    const hint = buildViewEditingHint({ detected: true, intent: "kit" });
    expect(hint).not.toContain("Detected app reference");
  });
});

describe("worked example: spec AC #8", () => {
  // Spec: typing "switch my habit tracker to workflow hub layout" results
  // in `set_app_view_kit("habit-tracker", "workflow-hub")` being called.
  // This test pins the classifier output that the LLM will see.
  it("classifies the spec example as kit + habit-tracker app reference", () => {
    const r = detectViewEditingIntent(
      "switch my habit-tracker to workflow-hub layout"
    );
    expect(r.intent).toBe("kit");
    expect(r.appHint).toBe("habit-tracker");

    const hint = buildViewEditingHint(r);
    // Hint must mention the kit tool and the habit-tracker app so the LLM
    // can produce the exact tool call. (The literal kit value is in the
    // user message; the hint nudges, the LLM extracts.)
    expect(hint).toContain("set_app_view_kit");
    expect(hint).toContain("habit-tracker");
    expect(hint).toContain("workflow-hub");
  });
});
