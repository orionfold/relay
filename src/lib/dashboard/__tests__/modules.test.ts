import { describe, expect, it } from "vitest";
import {
  DEFAULT_DASHBOARD_PREFERENCES,
  hiddenUrgentCount,
  rankDashboardModules,
} from "@/lib/dashboard/modules";

describe("dashboard module registry", () => {
  it("promotes unresolved action above active and recent work", () => {
    const ranked = rankDashboardModules(
      DEFAULT_DASHBOARD_PREFERENCES,
      {
        attention: { urgentCount: 1 },
        activity: { activeCount: 4, recentAt: 1_000 },
        packs: { relevanceCount: 6 },
        workshop: { eligible: false },
      },
      1_000
    );
    expect(ranked[0]?.id).toBe("attention");
    expect(ranked.some((module) => module.id === "workshop")).toBe(false);
  });

  it("uses stable registry order when smart ordering is disabled", () => {
    const ranked = rankDashboardModules(
      {
        version: 1,
        smartOrdering: false,
        visible: { activity: false },
      },
      {
        packs: { urgentCount: 9 },
        attention: { urgentCount: 0 },
        workshop: { eligible: true },
      }
    );
    expect(ranked.map((module) => module.id).slice(0, 3)).toEqual([
      "attention",
      "packs",
      "projects",
    ]);
  });

  it("reports urgent signals hidden by the operator", () => {
    expect(
      hiddenUrgentCount(
        {
          version: 1,
          smartOrdering: true,
          visible: { attention: false, costs: false },
        },
        {
          attention: { urgentCount: 2 },
          costs: { urgentCount: 1 },
        }
      )
    ).toBe(3);
  });
});
