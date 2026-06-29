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
  Globe,
  Settings,
  MessageCircle,
  ListTodo,
  Table2,
  BarChart3,
  Sparkles,
} from "lucide-react";

// Single source of truth for the navigation IA, consumed by the in-bar
// horizontal accordion (app-bar.tsx). The bar shows the group buttons; clicking
// one expands its children inline. Compose was split into Compose + Data so no
// group exceeds 4 children (caps the expanded row's width). Route set is
// otherwise byte-identical to the former sidebar IA.

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
  | "compose"
  | "data"
  | "observe"
  | "configure";

export interface NavGroup {
  id: NavGroupId;
  label: string;
  /** Group-level glyph shown on the collapsed group button in the bar. */
  icon: typeof Home;
  items: NavItem[];
}

const homeItems: NavItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, description: "Today's work at a glance" },
  { title: "Tasks", href: "/tasks", icon: ListTodo, description: "Work in flight across projects", alsoMatches: ["/tasks/"] },
  { title: "Inbox", href: "/inbox", icon: Inbox, description: "Approvals and notifications", badge: true },
  { title: "Chat", href: "/chat", icon: MessageCircle, description: "Talk directly with agents" },
];

const composeItems: NavItem[] = [
  { title: "Apps", href: "/apps", icon: Sparkles, description: "Composed apps — the entry point", alsoMatches: ["/apps/"] },
  { title: "Projects", href: "/projects", icon: FolderKanban, description: "Group work by project" },
  { title: "Workflows", href: "/workflows", icon: Workflow, description: "Multi-step agent pipelines" },
  { title: "Profiles", href: "/profiles", icon: Bot, description: "Tune agent behavior" },
];

const dataItems: NavItem[] = [
  { title: "Schedules", href: "/schedules", icon: Clock, description: "Recurring automated runs" },
  { title: "Documents", href: "/documents", icon: FileText, description: "Shared context library" },
  { title: "Tables", href: "/tables", icon: Table2, description: "Structured data views", alsoMatches: ["/tables/"] },
];

const observeItems: NavItem[] = [
  { title: "Monitor", href: "/monitor", icon: Activity, description: "Live agent activity stream" },
  { title: "Cost & Usage", href: "/costs", icon: Wallet, description: "Spend and model metering" },
  { title: "Analytics", href: "/analytics", icon: BarChart3, description: "Throughput and outcomes" },
];

const configureItems: NavItem[] = [
  { title: "Environment", href: "/environment", icon: Globe, description: "System prerequisites check" },
  { title: "Settings", href: "/settings", icon: Settings, description: "Models, auth, and defaults" },
];

export const NAV_GROUPS: NavGroup[] = [
  { id: "home", label: "Home", icon: Home, items: homeItems },
  { id: "compose", label: "Compose", icon: Sparkles, items: composeItems },
  { id: "data", label: "Data", icon: FileText, items: dataItems },
  { id: "observe", label: "Observe", icon: Activity, items: observeItems },
  { id: "configure", label: "Config", icon: Settings, items: configureItems },
];

export function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return (
    pathname === item.href ||
    pathname.startsWith(item.href + "/") ||
    (item.alsoMatches?.some((p) => pathname.startsWith(p)) ?? false)
  );
}

export function activeGroupId(pathname: string): NavGroupId {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (isItemActive(item, pathname)) return group.id;
    }
  }
  return "home";
}

export function groupHasActiveItem(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isItemActive(item, pathname));
}
