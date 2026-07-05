import {
  Home,
  LayoutDashboard,
  Inbox,
  Activity,
  FolderKanban,
  Workflow,
  FileText,
  Bot,
  Clock,
  Wallet,
  MessageCircle,
  ListTodo,
  Table2,
  Sparkles,
  Users,
  Boxes,
  Package,
  Layers,
  LayoutTemplate,
} from "lucide-react";

// Single source of truth for the navigation IA, consumed by the permanent
// two-tier bar (app-bar.tsx). Tier 1 shows every top-level section; tier 2
// shows the children of whichever section owns the current route — always
// visible, no sliding, no accordion. Apps is a top-level section (promoted from
// under Compose) whose tier-2 children are DYNAMIC app instances built at render
// time from listAppsCached(); its static `items` list is therefore empty. There
// is no per-group width cap anymore — each tier gets its own row.

export interface NavItem {
  title: string;
  href: string;
  icon: typeof Home;
  description: string;
  /** Renders the unread/approvals badge alongside this item. */
  badge?: boolean;
  /** Extra path prefixes that should mark this item active (e.g. detail routes). */
  alsoMatches?: string[];
}

export type NavGroupId =
  | "home"
  | "apps"
  | "compose"
  | "data"
  | "observe";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /** Section glyph shown on the tier-1 button. */
  icon: typeof Home;
  /** The section's landing route — tier-1 click navigates here. */
  href: string;
  /**
   * Static tier-2 children. Empty for `apps`, whose tier-2 is built from live
   * app instances (see appsNavItems) rather than a fixed list.
   */
  items: NavItem[];
  /** Path prefixes (beyond items' hrefs) that mark this section active. */
  alsoMatches?: string[];
}

const homeItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, description: "Today's work at a glance" },
  { title: "Tasks", href: "/tasks", icon: ListTodo, description: "Work in flight across projects", alsoMatches: ["/tasks/"] },
  { title: "Inbox", href: "/inbox", icon: Inbox, description: "Approvals and notifications", badge: true },
  { title: "Chat", href: "/chat", icon: MessageCircle, description: "Talk directly with agents" },
];

// Apps is now a top-level section. Its tier-2 children are the composed app
// instances (from listAppsCached), not a static list, so `items` is empty and
// the bar builds the row via appsNavItems(). Packs stays under Compose as the
// soft-gate discovery surface (PLG D6).
const composeItems: NavItem[] = [
  { title: "Packs", href: "/packs", icon: Boxes, description: "Install vertical content bundles", alsoMatches: ["/packs/"] },
  { title: "Projects", href: "/projects", icon: FolderKanban, description: "Group work by project", alsoMatches: ["/projects/"] },
  { title: "Workflows", href: "/workflows", icon: Workflow, description: "Multi-step agent pipelines", alsoMatches: ["/workflows/"] },
  { title: "Blueprints", href: "/blueprints", icon: Layers, description: "Reusable workflow templates", alsoMatches: ["/blueprints/"] },
  { title: "Agents", href: "/agents", icon: Bot, description: "Configure your agents", alsoMatches: ["/agents/"] },
  { title: "Presets", href: "/presets", icon: Sparkles, description: "Start from a built-in agent preset", alsoMatches: ["/presets/"] },
];

const dataItems: NavItem[] = [
  { title: "Customers", href: "/customers", icon: Users, description: "Accounts you run ops for", alsoMatches: ["/customers/"] },
  { title: "Schedules", href: "/schedules", icon: Clock, description: "Recurring automated runs", alsoMatches: ["/schedules/"] },
  { title: "Documents", href: "/documents", icon: FileText, description: "Shared context library", alsoMatches: ["/documents/"] },
  { title: "Tables", href: "/tables", icon: Table2, description: "Structured data views", alsoMatches: ["/tables/"] },
  { title: "Schemas", href: "/schemas", icon: LayoutTemplate, description: "Reusable table structures", alsoMatches: ["/schemas/"] },
];

const observeItems: NavItem[] = [
  { title: "Monitor", href: "/monitor", icon: Activity, description: "Live agent activity stream" },
  { title: "Cost & Usage", href: "/costs", icon: Wallet, description: "Spend and model metering" },
];

// NOTE: Analytics + Environment were RETIRED (routes + dashboards deleted, not
// just nav-hidden) per features/nav-redesign-ia.md — the load-bearing
// src/lib/environment infra (workspace-context, scanner, skill-enrichment, ...)
// stays; only the feature surface was cut. Settings lives in the app-bar right
// utility cluster as an icon-only gear, not a section.

export const NAV_GROUPS: NavGroup[] = [
  { id: "home", label: "Home", icon: Home, href: "/", items: homeItems },
  { id: "apps", label: "Apps", icon: Sparkles, href: "/apps", items: [], alsoMatches: ["/apps", "/apps/"] },
  { id: "compose", label: "Compose", icon: Package, href: "/packs", items: composeItems },
  { id: "data", label: "Data", icon: FileText, href: "/customers", items: dataItems },
  { id: "observe", label: "Observe", icon: Activity, href: "/monitor", items: observeItems },
];

/** A composed app instance as the shell needs it for the Apps tier-2 row. */
export interface AppInstance {
  id: string;
  name: string;
}

/**
 * Build the Apps section's tier-2 children from live app instances. Leads with
 * an "All apps" link to the /apps grid, then one item per instance (→
 * /apps/[id]). The caller decides how many instances to show inline vs. fold
 * into a "+N more" pill (see app-bar.tsx).
 */
export function appsNavItems(apps: AppInstance[]): NavItem[] {
  const allApps: NavItem = {
    title: "All apps",
    href: "/apps",
    icon: Sparkles,
    description: "Every composed app",
  };
  const instances: NavItem[] = apps.map((app) => ({
    title: app.name,
    href: `/apps/${app.id}`,
    icon: Package,
    description: app.name,
  }));
  return [allApps, ...instances];
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return (
    pathname === item.href ||
    pathname.startsWith(item.href + "/") ||
    (item.alsoMatches?.some((p) => pathname.startsWith(p)) ?? false)
  );
}

/** True when this section owns the current route (via items or alsoMatches). */
export function groupHasActiveItem(group: NavGroup, pathname: string): boolean {
  if (group.items.some((item) => isItemActive(item, pathname))) return true;
  return group.alsoMatches?.some((p) => pathname === p || pathname.startsWith(p)) ?? false;
}

export function activeGroupId(pathname: string): NavGroupId {
  for (const group of NAV_GROUPS) {
    if (groupHasActiveItem(group, pathname)) return group.id;
  }
  return "home";
}
