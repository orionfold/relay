import { describe, it, expect } from "vitest";
import {
  NAV_GROUPS,
  appsNavItems,
  isItemActive,
  activeGroupId,
  groupHasActiveItem,
  type NavItem,
} from "../nav-items";

describe("nav-items", () => {
  it("exposes the five top-level IA sections", () => {
    // Permanent two-tier bar: Packs owns bundled discovery plus installed pack
    // instances; Analytics + Environment RETIRED (not just nav-hidden);
    // Settings lives in the app-bar utility cluster.
    expect(NAV_GROUPS.map((g) => g.id)).toEqual([
      "home",
      "apps",
      "compose",
      "data",
      "observe",
    ]);
    expect(NAV_GROUPS.find((g) => g.id === "apps")?.label).toBe("Packs");
  });

  it("gives every section a landing href", () => {
    for (const group of NAV_GROUPS) {
      expect(group.href).toMatch(/^\//);
    }
  });

  it("keeps the retired + utility routes out of every static nav section", () => {
    const allHrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(allHrefs).not.toContain("/analytics");
    expect(allHrefs).not.toContain("/environment");
    expect(allHrefs).not.toContain("/settings");
  });

  it("has no static children for Packs — its tier-2 is built from live instances", () => {
    const apps = NAV_GROUPS.find((g) => g.id === "apps")!;
    expect(apps.items).toEqual([]);
  });

  it("moves Packs out of Compose (no longer a compose child)", () => {
    const compose = NAV_GROUPS.find((g) => g.id === "compose")!;
    expect(compose.items.map((i) => i.href)).not.toContain("/packs");
  });

  describe("appsNavItems", () => {
    it("leads with pack browser links then one item per installed instance", () => {
      const items = appsNavItems([
        { id: "abc", name: "Northstar Site Visits" },
        { id: "def", name: "Payroll Ops" },
      ]);
      expect(items[0]).toMatchObject({ title: "Browse packs", href: "/packs" });
      expect(items[1]).toMatchObject({ title: "Installed", href: "/apps" });
      expect(items[2]).toMatchObject({ title: "Northstar Site Visits", href: "/apps/abc" });
      expect(items[3]).toMatchObject({ title: "Payroll Ops", href: "/apps/def" });
    });

    it("returns pack browser links when there are no instances", () => {
      const items = appsNavItems([]);
      expect(items).toHaveLength(2);
      expect(items[0].href).toBe("/packs");
      expect(items[1].href).toBe("/apps");
    });
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
    it("maps Packs and installed-pack routes to the top-level packs section", () => {
      expect(activeGroupId("/packs")).toBe("apps");
      expect(activeGroupId("/apps")).toBe("apps");
      expect(activeGroupId("/apps/abc-123")).toBe("apps");
    });

    it("maps a route to its owning section", () => {
      expect(activeGroupId("/")).toBe("home");
      expect(activeGroupId("/workflows/abc")).toBe("compose");
      expect(activeGroupId("/customers")).toBe("data");
      expect(activeGroupId("/customers/abc-123")).toBe("data");
      expect(activeGroupId("/schedules")).toBe("data");
      expect(activeGroupId("/documents")).toBe("data");
      expect(activeGroupId("/costs")).toBe("observe");
    });

    it("falls back to 'home' for an unknown route", () => {
      expect(activeGroupId("/nonexistent")).toBe("home");
    });

    it("falls back to 'home' for /settings (utility cluster, not a section)", () => {
      expect(activeGroupId("/settings")).toBe("home");
    });
  });

  describe("elevated Blueprints route", () => {
    const compose = NAV_GROUPS.find((g) => g.id === "compose")!;
    const blueprints = compose.items.find((i) => i.href === "/blueprints")!;
    const workflows = compose.items.find((i) => i.href === "/workflows")!;

    it("exposes Blueprints as a top-level Compose child", () => {
      expect(blueprints).toBeDefined();
      expect(blueprints.title).toBe("Blueprints");
    });

    it("lights up Blueprints (and NOT Workflows) on /blueprints and its children", () => {
      expect(isItemActive(blueprints, "/blueprints")).toBe(true);
      expect(isItemActive(blueprints, "/blueprints/new")).toBe(true);
      expect(isItemActive(blueprints, "/blueprints/some-id")).toBe(true);
      // Elevation out of /workflows/* is what makes the disambiguation clean:
      // Workflows no longer owns the blueprints path.
      expect(isItemActive(workflows, "/blueprints")).toBe(false);
    });

    it("keeps Workflows active on its own routes", () => {
      expect(isItemActive(workflows, "/workflows")).toBe(true);
      expect(isItemActive(workflows, "/workflows/abc")).toBe(true);
      expect(isItemActive(blueprints, "/workflows")).toBe(false);
    });
  });

  describe("Schemas under Data, after Tables", () => {
    const data = NAV_GROUPS.find((g) => g.id === "data")!;
    const compose = NAV_GROUPS.find((g) => g.id === "compose")!;
    const schemas = data.items.find((i) => i.href === "/schemas")!;
    const tables = data.items.find((i) => i.href === "/tables")!;

    it("exposes Schemas as a Data child, paired with its Tables instances", () => {
      expect(schemas).toBeDefined();
      expect(schemas.title).toBe("Schemas");
    });

    it("places Schemas immediately after Tables in the Data row", () => {
      const tablesIndex = data.items.findIndex((i) => i.href === "/tables");
      const schemasIndex = data.items.findIndex((i) => i.href === "/schemas");
      expect(schemasIndex).toBe(tablesIndex + 1);
    });

    it("no longer exposes Schemas under Compose", () => {
      expect(compose.items.find((i) => i.href === "/schemas")).toBeUndefined();
    });

    it("lights up Schemas (and NOT Tables) on /schemas under Data; Tables stays on /tables", () => {
      expect(isItemActive(schemas, "/schemas")).toBe(true);
      expect(activeGroupId("/schemas")).toBe("data");
      expect(isItemActive(tables, "/schemas")).toBe(false);
      expect(isItemActive(tables, "/tables")).toBe(true);
      expect(isItemActive(schemas, "/tables")).toBe(false);
    });
  });

  describe("elevated Presets route", () => {
    const compose = NAV_GROUPS.find((g) => g.id === "compose")!;
    const presets = compose.items.find((i) => i.href === "/presets")!;
    const agents = compose.items.find((i) => i.href === "/agents")!;

    it("exposes Presets as a top-level Compose child, peer of Agents (FEAT-13)", () => {
      expect(presets).toBeDefined();
      expect(presets.title).toBe("Presets");
    });

    it("lights up Presets (and NOT Agents) on /presets; Agents stays on /agents", () => {
      expect(isItemActive(presets, "/presets")).toBe(true);
      expect(activeGroupId("/presets")).toBe("compose");
      expect(isItemActive(agents, "/presets")).toBe(false);
      expect(isItemActive(agents, "/agents")).toBe(true);
      expect(isItemActive(presets, "/agents")).toBe(false);
    });
  });

  describe("groupHasActiveItem", () => {
    it("is true only for the section owning the route", () => {
      const compose = NAV_GROUPS.find((g) => g.id === "compose")!;
      const observe = NAV_GROUPS.find((g) => g.id === "observe")!;
      const apps = NAV_GROUPS.find((g) => g.id === "apps")!;
      expect(groupHasActiveItem(compose, "/workflows")).toBe(true);
      expect(groupHasActiveItem(observe, "/workflows")).toBe(false);
      expect(groupHasActiveItem(apps, "/apps/xyz")).toBe(true);
      expect(groupHasActiveItem(apps, "/packs")).toBe(true);
      expect(groupHasActiveItem(compose, "/packs")).toBe(false);
    });
  });
});
