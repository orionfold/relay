/** @vitest-environment node */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CRITICAL_API_ROUTE_CONTRACTS } from "@/test/critical-api-contracts";

describe("G-070 critical API route inventory", () => {
  it("contains exactly the bounded 12-contract tranche with unique route methods", () => {
    expect(CRITICAL_API_ROUTE_CONTRACTS.map((contract) => contract.id)).toEqual([
      "task-create",
      "task-execute",
      "task-resume",
      "task-cancel",
      "workflow-execute",
      "schedule-execute",
      "schedule-control",
      "chat-message-stream",
      "chat-permission-respond",
      "ollama-runtime-probe",
      "compatible-runtime-probe",
      "runtime-connection-test",
    ]);

    const routeMethods = CRITICAL_API_ROUTE_CONTRACTS.map(
      (contract) => `${contract.method} ${contract.routeFile}`
    );
    expect(new Set(routeMethods).size).toBe(routeMethods.length);
  });

  it("points every contract to an exported handler and existing adjacent guards", () => {
    for (const contract of CRITICAL_API_ROUTE_CONTRACTS) {
      const routePath = resolve(process.cwd(), contract.routeFile);
      expect(existsSync(routePath), contract.id).toBe(true);
      expect(readFileSync(routePath, "utf8"), contract.id).toMatch(
        new RegExp(`export\\s+async\\s+function\\s+${contract.method}\\b`)
      );
      expect(contract.terminalOutcomes.length, contract.id).toBeGreaterThan(1);
      expect(contract.guards.length, contract.id).toBeGreaterThan(0);
      for (const guard of contract.guards) {
        expect(existsSync(resolve(process.cwd(), guard)), `${contract.id}: ${guard}`).toBe(
          true
        );
      }
    }
  });

  it("keeps every selected risk family represented without expanding the tranche", () => {
    const counts = Object.groupBy(
      CRITICAL_API_ROUTE_CONTRACTS,
      (contract) => contract.family
    );
    expect(Object.fromEntries(
      Object.entries(counts).map(([family, contracts]) => [family, contracts?.length])
    )).toEqual({ task: 4, workflow: 1, schedule: 2, chat: 2, runtime: 3 });
  });
});
