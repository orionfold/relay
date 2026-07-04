import { describe, it, expect } from "vitest";
import {
  COMMAND_TABS,
  GROUP_TO_TAB,
  partitionCatalogByTab,
  isCommandTabId,
  type CommandTabId,
} from "../command-tabs";
import type { ToolCatalogEntry, ToolGroup } from "../tool-catalog";

const entry = (name: string, group: ToolGroup): ToolCatalogEntry => ({
  name,
  description: name,
  group,
});

describe("command-tabs", () => {
  it("exposes four tabs in canonical order", () => {
    expect(COMMAND_TABS.map((t) => t.id)).toEqual([
      "actions",
      "skills",
      "tools",
      "entities",
    ]);
  });

  it("maps every ToolGroup to exactly one tab", () => {
    const groups: ToolGroup[] = [
      "Session", "Tasks", "Projects", "Workflows", "Schedules", "Documents", "Tables",
      "Notifications", "Agents", "Skills", "Usage", "Settings", "Chat",
      "Browser", "Utility",
    ];
    for (const g of groups) {
      expect(GROUP_TO_TAB[g]).toBeDefined();
    }
  });

  it("routes Session group to the Actions tab", () => {
    expect(GROUP_TO_TAB.Session).toBe("actions");
  });

  it("routes Skills group to the Skills tab", () => {
    expect(GROUP_TO_TAB.Skills).toBe("skills");
  });

  it("routes Browser + Utility to the Tools tab", () => {
    expect(GROUP_TO_TAB.Browser).toBe("tools");
    expect(GROUP_TO_TAB.Utility).toBe("tools");
  });

  it("partitions catalog entries by tab", () => {
    const catalog: ToolCatalogEntry[] = [
      entry("list_tasks", "Tasks"),
      entry("researcher", "Skills"),
      entry("take_screenshot", "Browser"),
    ];
    const part = partitionCatalogByTab(catalog);
    expect(part.actions.map((e) => e.name)).toEqual(["list_tasks"]);
    expect(part.skills.map((e) => e.name)).toEqual(["researcher"]);
    expect(part.tools.map((e) => e.name)).toEqual(["take_screenshot"]);
    expect(part.entities).toEqual([]);
  });

  it("isCommandTabId rejects unknown values", () => {
    expect(isCommandTabId("actions")).toBe(true);
    expect(isCommandTabId("random")).toBe(false);
  });
});
