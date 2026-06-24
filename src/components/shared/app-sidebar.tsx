"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  BookMarked,
  Globe,
  Settings,
  MessageCircle,
  ListTodo,
  Table2,
  BarChart3,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  SidebarTrigger,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { useApps } from "@/lib/apps/use-apps";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { TrustTierBadge } from "@/components/shared/trust-tier-badge";
import { UnreadBadge } from "@/components/notifications/unread-badge";
import { UpgradeBadge } from "@/components/instance/upgrade-badge";
import { AuthStatusDot } from "@/components/settings/auth-status-dot";
import { AinativeLogo } from "@/components/shared/ainative-logo";
import { AinativeWordmark } from "@/components/shared/ainative-wordmark";
import { WorkspaceIndicator } from "@/components/shared/workspace-indicator";

interface NavItem {
  title: string;
  href: string;
  icon: typeof Home;
  description: string;
  badge?: boolean;
  alsoMatches?: string[];
}

type GroupId = "home" | "compose" | "observe" | "learn" | "configure";

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
  { title: "Schedules", href: "/schedules", icon: Clock, description: "Recurring automated runs" },
  { title: "Documents", href: "/documents", icon: FileText, description: "Shared context library" },
  { title: "Tables", href: "/tables", icon: Table2, description: "Structured data views", alsoMatches: ["/tables/"] },
];

const observeItems: NavItem[] = [
  { title: "Monitor", href: "/monitor", icon: Activity, description: "Live agent activity stream" },
  { title: "Cost & Usage", href: "/costs", icon: Wallet, description: "Spend and model metering" },
  { title: "Analytics", href: "/analytics", icon: BarChart3, description: "Throughput and outcomes" },
];

const learnItems: NavItem[] = [
  { title: "User Guide", href: "/user-guide", icon: BookMarked, description: "How-tos and walkthroughs" },
];

const configureItems: NavItem[] = [
  { title: "Environment", href: "/environment", icon: Globe, description: "System prerequisites check" },
  { title: "Settings", href: "/settings", icon: Settings, description: "Models, auth, and defaults" },
];

const groupMap: { id: GroupId; label: string; items: NavItem[] }[] = [
  { id: "home", label: "Home", items: homeItems },
  { id: "compose", label: "Compose", items: composeItems },
  { id: "observe", label: "Observe", items: observeItems },
  { id: "learn", label: "Learn", items: learnItems },
  { id: "configure", label: "Configure", items: configureItems },
];

function isItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return (
    pathname === item.href ||
    pathname.startsWith(item.href + "/") ||
    (item.alsoMatches?.some((p) => pathname.startsWith(p)) ?? false)
  );
}

function buildSubtext(items: NavItem[]): string {
  const maxShow = 3;
  const shown = items.slice(0, maxShow).map((i) => i.title).join(", ");
  const overflow = items.length - maxShow;
  return overflow > 0 ? `${shown}, +${overflow}` : shown;
}

function AppsSubMenu({ pathname }: { pathname: string }) {
  const { apps } = useApps();
  if (apps.length === 0) return null;

  return (
    <SidebarMenuSub className="group-data-[collapsible=icon]:hidden">
      {apps.map((app) => {
        const href = `/apps/${app.id}`;
        const isActive = pathname === href;
        return (
          <SidebarMenuSubItem
            key={app.id}
            className="animate-in fade-in slide-in-from-left-2 duration-200"
          >
            <SidebarMenuSubButton asChild isActive={isActive}>
              <Link href={href}>
                <span className="truncate">{app.name}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </SidebarMenuSub>
  );
}

function NavGroup({
  label,
  items,
  pathname,
  isExpanded,
  onToggle,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const subtext = useMemo(() => buildSubtext(items), [items]);

  return (
    <SidebarGroup>
      {/* Accordion header — hidden in icon-collapse mode */}
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-2 py-1.5
                   rounded-md hover:bg-sidebar-accent/50 transition-colors cursor-pointer
                   group-data-[collapsible=icon]:hidden"
        aria-expanded={isExpanded}
      >
        <div className="flex flex-col items-start gap-0.5 min-w-0">
          <span className="text-xs font-medium text-sidebar-foreground/70">
            {label}
          </span>
          <span
            className={cn(
              "text-[11px] text-sidebar-foreground/40 leading-tight truncate max-w-full transition-opacity duration-150",
              isExpanded ? "opacity-0 h-0" : "opacity-100"
            )}
          >
            {subtext}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-200",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {/* Icon-mode label — visible only when sidebar is collapsed to icons */}
      <SidebarGroupLabel className="hidden group-data-[collapsible=icon]:flex">
        {label}
      </SidebarGroupLabel>

      {/* Collapsible content — grid-rows animation */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out group-data-[collapsible=icon]:!grid-rows-[1fr]",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    size="lg"
                    tooltip={item.title}
                    isActive={isItemActive(item, pathname)}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 group-data-[collapsible=icon]:hidden">
                        <span className="truncate leading-tight">{item.title}</span>
                        <span className="truncate text-[10.5px] leading-tight text-sidebar-foreground/50">
                          {item.description}
                        </span>
                      </div>
                      {item.badge && (
                        <span className="group-data-[collapsible=icon]:hidden">
                          <UnreadBadge />
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                  {item.href === "/apps" && <AppsSubMenu pathname={pathname} />}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </div>
      </div>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  // Determine which group owns the current route
  const activeGroup = useMemo(() => {
    for (const group of groupMap) {
      for (const item of group.items) {
        if (isItemActive(item, pathname)) return group.id;
      }
    }
    return "home" as GroupId; // default to Home if no match
  }, [pathname]);

  const [expandedGroup, setExpandedGroup] = useState<GroupId | null>(activeGroup);

  // Auto-expand the group containing the active route on navigation
  useEffect(() => {
    setExpandedGroup(activeGroup);
  }, [activeGroup]);

  const toggleGroup = useCallback((id: GroupId) => {
    setExpandedGroup((prev) => (prev === id ? null : id));
  }, []);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-3">
        <div className="flex items-center justify-between">
          <AinativeWordmark className="group-data-[collapsible=icon]:hidden" />
          <Link href="/" className="hidden group-data-[collapsible=icon]:flex items-center justify-center" aria-label="ainative home">
            <AinativeLogo size={20} />
          </Link>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groupMap.map((group) => (
          <NavGroup
            key={group.id}
            label={group.label}
            items={group.items}
            pathname={pathname}
            isExpanded={expandedGroup === group.id}
            onToggle={() => toggleGroup(group.id)}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className="px-4 py-3">
        <div className="group-data-[collapsible=icon]:hidden mb-2 empty:hidden">
          <UpgradeBadge />
        </div>
        <SidebarSeparator className="!-mx-4 !w-[calc(100%+2rem)] mb-2 group-data-[collapsible=icon]:hidden" />
        <div className="group-data-[collapsible=icon]:hidden mb-2">
          <WorkspaceIndicator variant="sidebar" />
        </div>
        <SidebarSeparator className="!-mx-4 !w-[calc(100%+2rem)] group-data-[collapsible=icon]:hidden" />
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center mt-2">
          <div className="flex items-center gap-3 group-data-[collapsible=icon]:hidden">
            <AuthStatusDot />
            <TrustTierBadge />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                document.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    key: "k",
                    metaKey: true,
                    bubbles: true,
                  })
                )
              }
              className="h-7 px-1.5 rounded-md border border-border/50 text-[10px] font-medium text-muted-foreground hover:bg-accent/50 transition-colors cursor-pointer group-data-[collapsible=icon]:hidden"
              aria-label="Open command palette (⌘K)"
            >
              <kbd>⌘K</kbd>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
