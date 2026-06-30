import { describe, it, expect } from "vitest";
import { getBlueprint } from "../registry";

/**
 * Phase 5 blueprints (`customer-follow-up-drafter--draft-followup` and
 * `research-digest--weekly-digest`) ship as repo-bundled builtins under
 * `src/lib/workflows/blueprints/builtins/`. The registry auto-scans
 * BUILTINS_DIR on first load, so a plain `getBlueprint()` call resolves
 * them regardless of the test runner's `RELAY_DATA_DIR` override.
 *
 * Earlier versions of this test copied from `~/.ainative/blueprints/`
 * (gitignored), which only worked on the developer's machine that
 * authored Phase 5. Promoting to builtins/ makes the test pass for all
 * contributors. Per the row-trigger-blueprint-execution handoff
 * recommendation: "a missing builtin is a real gap, not a test infra
 * issue."
 */

describe("customer-follow-up-drafter--draft-followup blueprint", () => {
  it("loads from the registry and parses cleanly", () => {
    const bp = getBlueprint("customer-follow-up-drafter--draft-followup");
    expect(bp).toBeDefined();
    expect(bp!.id).toBe("customer-follow-up-drafter--draft-followup");
    expect(bp!.steps.length).toBe(1);
    expect(bp!.variables.find((v) => v.id === "customer")).toBeDefined();
    expect(bp!.variables.find((v) => v.id === "summary")?.required).toBe(true);
  });
});

describe("research-digest--weekly-digest blueprint", () => {
  it("loads from the registry and parses cleanly", () => {
    const bp = getBlueprint("research-digest--weekly-digest");
    expect(bp).toBeDefined();
    expect(bp!.id).toBe("research-digest--weekly-digest");
    expect(bp!.steps.length).toBe(1);
  });
});
