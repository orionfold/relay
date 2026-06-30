import { describe, it, expect } from "vitest";
import {
  NAV_GROUPS,
  isItemActive,
  activeGroupId,
  groupHasActiveItem,
  type NavItem,
} from "../nav-items";

describe("nav-items", () => {
  it("exposes the four IA groups with 13 routes total", () => {
    // The `configure` group was dissolved per _SPECS/feature-cut-freeze.md:
    // Environment deferred, Analytics deprecated, Settings moved to the app-bar.
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "home",
      "compose",
      "data",
      "observe",
    ]);
    const total = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(13);
  });

  it("keeps the cut routes out of every nav group", () => {
    const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/analytics");
    expect(allHrefs).not.toContain("/environment");
    expect(allHrefs).not.toContain("/settings");
  });

  it("caps every group at 4 children (keeps the expanded row narrow)", () => {
    for (const group of NAV_GROUPS) {
      expect(group.items.length).toBeLessThanOrEqual(4);
    }
  });

  describe("isItemActive", () => {
    const icon = NAV_GROUPS[0].items[0].icon;
    const dashboard: NavItem = { title: "Dashboard", href: "/", icon, description: "" };
    const tasks: NavItem = {
      title: "Tasks",
      href: "/tasks",
      icon,
      description: "",
      alsoMatches: ["/tasks/"],
    };

    it("matches the root route only on an exact '/' pathname", () => {
      expect(isItemActive(dashboard, "/")).toBe(true);
      expect(isItemActive(dashboard, "/tasks")).toBe(false);
    });

    it("matches a route on exact, nested, and alsoMatches prefixes", () => {
      expect(isItemActive(tasks, "/tasks")).toBe(true);
      expect(isItemActive(tasks, "/tasks/abc-123")).toBe(true);
      expect(isItemActive(tasks, "/tasksfoo")).toBe(false);
    });
  });

  describe("activeGroupId", () => {
    it("maps a route to its owning group (incl. the new Data split)", () => {
      expect(activeGroupId("/")).toBe("home");
      expect(activeGroupId("/workflows/abc")).toBe("compose");
      expect(activeGroupId("/schedules")).toBe("data");
      expect(activeGroupId("/documents")).toBe("data");
      expect(activeGroupId("/costs")).toBe("observe");
    });

    it("falls back to 'home' for an unknown route", () => {
      expect(activeGroupId("/nonexistent")).toBe("home");
    });

    it("falls back to 'home' for /settings (now in the app-bar, not a group)", () => {
      expect(activeGroupId("/settings")).toBe("home");
    });
  });

  describe("groupHasActiveItem", () => {
    it("is true only for the group owning the route", () => {
      const compose = NAV_GROUPS.find((g) => g.id === "compose")!;
      const observe = NAV_GROUPS.find((g) => g.id === "observe")!;
      expect(groupHasActiveItem(compose, "/workflows")).toBe(true);
      expect(groupHasActiveItem(observe, "/workflows")).toBe(false);
    });
  });
});
