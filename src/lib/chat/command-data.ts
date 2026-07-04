import {
  LayoutDashboard,
  Table2,
  Inbox,
  Activity,
  FolderKanban,
  GitBranch,
  FileText,
  Bot,
  Clock,
  Wallet,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  title: string;
  href: string;
  icon: LucideIcon;
  keywords: string;
}

export interface CreateItem {
  title: string;
  href: string;
  keywords: string;
}

export const navigationItems: NavigationItem[] = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard, keywords: "home overview stats priority today" },
  { title: "Tasks", href: "/tasks", icon: Table2, keywords: "tasks kanban board queue" },
  { title: "Inbox", href: "/inbox", icon: Inbox, keywords: "notifications messages" },
  { title: "Monitor", href: "/monitor", icon: Activity, keywords: "logs agents streaming" },
  { title: "Projects", href: "/projects", icon: FolderKanban, keywords: "manage" },
  { title: "Workflows", href: "/workflows", icon: GitBranch, keywords: "automation steps sequence" },
  { title: "Documents", href: "/documents", icon: FileText, keywords: "files uploads attachments" },
  { title: "Agents", href: "/agents", icon: Bot, keywords: "agents configuration" },
  { title: "Schedules", href: "/schedules", icon: Clock, keywords: "cron recurring timer" },
  { title: "Cost & Usage", href: "/costs", icon: Wallet, keywords: "spend tokens metering budget analytics" },
  { title: "Settings", href: "/settings", icon: Settings, keywords: "preferences configuration" },
];

export const createItems: CreateItem[] = [
  { title: "New Task", href: "/tasks?create=task", keywords: "create add task" },
  { title: "New Project", href: "/projects?create=project", keywords: "create add project" },
  { title: "New Workflow", href: "/workflows/new", keywords: "create add workflow automation" },
  { title: "New Agent", href: "/agents/new", keywords: "create add agent profile" },
];
