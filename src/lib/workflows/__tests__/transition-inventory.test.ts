/** @vitest-environment node */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { WORKFLOW_TRANSITION_CONTRACTS } from "@/test/workflow-transition-contracts";

describe("G-071 workflow recovery transition matrix", () => {
  it("contains the exact bounded recovery tranche with unique IDs", () => {
    expect(WORKFLOW_TRANSITION_CONTRACTS.map((contract) => contract.id)).toEqual([
      "sequence-child-failure",
      "parallel-partial-failure",
      "parallel-all-failure",
      "loop-autonomous-failure",
      "loop-row-partial-failure",
      "delay-duplicate-resume",
      "delay-invalid-state",
      "hitl-reentry",
      "hitl-stale-answer",
      "stop-cancel-refusal",
      "stop-success",
      "retry-duplicate-claim",
    ]);
    expect(new Set(WORKFLOW_TRANSITION_CONTRACTS.map(({ id }) => id)).size).toBe(
      WORKFLOW_TRANSITION_CONTRACTS.length
    );
  });

  it("keeps every transition actionable and guarded", () => {
    for (const contract of WORKFLOW_TRANSITION_CONTRACTS) {
      expect(contract.from, contract.id).toBeTruthy();
      expect(contract.event, contract.id).toBeTruthy();
      expect(contract.to, contract.id).toBeTruthy();
      expect(contract.invariant, contract.id).toBeTruthy();
      expect(contract.guards.length, contract.id).toBeGreaterThan(0);
      for (const guard of contract.guards) {
        expect(existsSync(resolve(process.cwd(), guard)), `${contract.id}: ${guard}`).toBe(
          true
        );
      }
    }
  });
});
