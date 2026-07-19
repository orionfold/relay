import { describe, expect, it } from "vitest";
import { estimateHostDeployment, hostCapacityForDraft } from "../catalog";
import { defaultHostDeploymentDraft } from "../contracts";

describe("Host deployment estimate", () => {
  it("keeps local placement provider-free and names provisional admission", () => {
    const draft = defaultHostDeploymentDraft(0);
    const estimate = estimateHostDeployment(draft);
    expect(estimate).toMatchObject({
      monthlyLow: 0,
      monthlyHigh: 0,
      hostCount: 1,
      requestedCells: 1,
      reservePercent: 20,
      provisional: true,
    });
    expect(estimate.exclusions.join(" ")).toContain("model/API");
  });

  it("reproduces the dated cloud-preview VPS range and sharding point", () => {
    const draft = {
      ...defaultHostDeploymentDraft(0),
      placement: "cloud_preview" as const,
      regionRef: "sfo3" as const,
      backupProfile: "weekly_provider" as const,
      desiredCells: 10,
      sizeRef: "basic-4gib-2vcpu" as const,
    };
    const estimate = estimateHostDeployment(draft);
    expect(estimate.sourceDate).toBe("2026-07-16");
    expect(estimate.admittedCellsPerHost).toBe(3);
    expect(estimate.hostCount).toBe(4);
    expect(estimate.monthlyLow).toBe(115.2);
    expect(estimate.monthlyHigh).toBe(144);
    expect(hostCapacityForDraft(draft)).toMatchObject({
      cpuMillis: 2000,
      memoryBytes: 4 * 1024 ** 3,
      reservePercent: 20,
    });
  });
});
