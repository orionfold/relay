import { describe, it, expect } from "vitest";
import {
  NAV_GROUPS,
  isItemActive,
  activeGroupId,
  groupHasActiveItem,
  type NavItem,
} from "../nav-items";

describe("nav-items", () => {
  it("exposes the five IA groups with 16 routes total", () => {
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "home",
      "compose",
      "data",
      "observe",
      "configure",
    ]);
    const total = NAV_GROUPS.reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(16);
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
      expect(activeGroupId("/settings")).toBe("configure");
    });

    it("falls back to 'home' for an unknown route", () => {
      expect(activeGroupId("/nonexistent")).toBe("home");
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
