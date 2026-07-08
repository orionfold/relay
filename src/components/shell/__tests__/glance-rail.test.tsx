import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GlanceRail } from "../glance-rail";
import * as useSettingsGlanceModule from "../use-settings-glance";
import type { SettingsGlanceResponse } from "../use-settings-glance";

function glance(overrides: Partial<SettingsGlanceResponse> = {}): SettingsGlanceResponse {
  return {
    activeRuntimeLabel: "Claude Code",
    activeModel: "claude-opus-4-8",
    routingPreference: "quality",
    configuredRuntimeCount: 2,
    sdkTimeoutSeconds: 120,
    maxTurns: 8,
    licenseTag: { kind: "licensed", label: "Pro" },
    budgetMonthlyCapUsd: 20,
    activePreset: "git-safe",
    allowedPermissionCount: 4,
    webSearchEnabled: true,
    channelCount: 3,
    autoPromoteSkills: false,
    ...overrides,
  };
}

function stubGlance(data: SettingsGlanceResponse) {
  vi.spyOn(useSettingsGlanceModule, "useSettingsGlance").mockReturnValue({
    status: "ready",
    data,
  });
}

describe("GlanceRail drill-down links", () => {
  it("links resolved settings values to focused settings anchors from the collapsed rail", () => {
    stubGlance(glance());
    render(<GlanceRail />);

    expect(screen.getByRole("link", { name: "Open Budget settings" })).toHaveAttribute(
      "href",
      "/settings#settings-budget",
    );
    expect(screen.getByRole("link", { name: "Open Search settings" })).toHaveAttribute(
      "href",
      "/settings#settings-web-search",
    );
    expect(screen.getByRole("link", { name: "Open Timeout settings" })).toHaveAttribute(
      "href",
      "/settings#settings-runtime",
    );
    expect(screen.getByRole("link", { name: "Open Preset settings" })).toHaveAttribute(
      "href",
      "/settings#settings-permissions",
    );
    expect(screen.queryByRole("button", { name: "Expand settings" })).not.toBeInTheDocument();
  });
});
