import { describe, expect, it } from "vitest";
import { AppManifestSchema } from "../registry";

describe("AppManifestSchema budget recommendations", () => {
  it("accepts typed app and schedule recommendations", () => {
    const manifest = AppManifestSchema.parse({
      id: "cost-aware-pack",
      name: "Cost aware pack",
      schedules: [
        { id: "daily", name: "Daily", cron: "0 9 * * *", runs: "daily-bp" },
      ],
      budgetPolicies: [
        {
          id: "app-stop-loss",
          scope: "app",
          maxCostPerMonthUsd: 25,
          onExceed: "pause",
        },
        {
          id: "daily-stop-loss",
          scope: "schedule",
          schedule: "daily",
          maxCostPerRunUsd: 0.5,
          onExceed: "notify",
        },
      ],
    });

    expect(manifest.budgetPolicies).toHaveLength(2);
    expect(manifest.budgetPolicies[1].schedule).toBe("daily");
  });

  it("rejects recommendations with no ceiling or an unknown schedule", () => {
    expect(
      AppManifestSchema.safeParse({
        id: "broken-pack",
        name: "Broken pack",
        schedules: [{ id: "daily", name: "Daily", cron: "0 9 * * *", runs: "bp" }],
        budgetPolicies: [
          {
            id: "missing-limit",
            scope: "app",
          },
          {
            id: "missing-schedule",
            scope: "schedule",
            schedule: "weekly",
            maxCostPerDayUsd: 1,
          },
        ],
      }).success
    ).toBe(false);
  });
});
