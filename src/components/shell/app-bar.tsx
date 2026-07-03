"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { AinativeWordmark } from "@/components/shared/ainative-wordmark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AuthStatusDot } from "@/components/settings/auth-status-dot";
import { UnreadBadge } from "@/components/notifications/unread-badge";
import {
  NAV_GROUPS,
  appsNavItems,
  isItemActive,
  activeGroupId,
  type AppInstance,
  type NavItem,
} from "./nav-items";

// The Arena app bar as a PERMANENT TWO-TIER bar (replaces the sliding
// accordion). Tier 1 lists every top-level section; tier 2 shows the children
// of whichever section owns the current route — always visible, no toggle, no
// per-group width cap. Apps is a top-level section whose tier-2 row is built
// from live composed-app instances (+ a leading "All apps" link); instances
// beyond APPS_INLINE_MAX fold into a "+N more" pill that links to /apps. Active
// = cyan fill, the bar's single action color.

// Max app instances shown inline in the Apps tier-2 row before the rest fold
// into "+N more". Keeps the row from overflowing on small viewports; the /apps
// grid is the full list.
const APPS_INLINE_MAX = 5;

function openCommandPalette() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
  );
}

/** A tier-2 child pill (icon + label, optional badge). */
function TierTwoLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isItemActive(item, pathname);
  const Icon = item.icon;
  return (
    <li className="flex">
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={item.description}
        className={cn(
          "flex items-center gap-2 whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors",
          active
            ? "bg-primary text-primary-foreground shadow-[0_0_0_1px_var(--ring)]"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            active ? "text-primary-foreground" : "text-muted-foreground",
          )}
          aria-hidden
        />
        <span className="flex items-center gap-1.5 text-[13px] font-medium leading-tight">
          {item.title}
          {item.badge && (
            <span className={active ? "[&_*]:!text-primary-foreground" : ""}>
              <UnreadBadge />
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export function AppBar({ apps }: { apps: AppInstance[] }) {
  const pathname = usePathname();
  const activeId = activeGroupId(pathname);
  const activeGroup = NAV_GROUPS.find((g) => g.id === activeId) ?? NAV_GROUPS[0];
  const settingsActive = pathname.startsWith("/settings");

  // Tier-2 children of the active section. Apps is dynamic (live instances);
  // every other section uses its static items.
  let tierTwo: NavItem[];
  let overflowCount = 0;
  if (activeGroup.id === "apps") {
    const all = appsNavItems(apps); // [All apps, ...instances]
    const instances = all.slice(1);
    const shown = instances.slice(0, APPS_INLINE_MAX);
    overflowCount = instances.length - shown.length;
    tierTwo = [all[0], ...shown];
  } else {
    tierTwo = activeGroup.items;
  }

  return (
    <header className="sticky top-0 z-30 flex flex-col border-b border-border bg-[var(--surface-1)]">
      {/* Tier 1 — top-level sections + utility cluster. */}
      <div className="flex h-14 flex-none items-center gap-3 px-4">
        <Link
          href="/"
          aria-label="Orionfold Relay home"
          className="flex shrink-0 items-center"
        >
          <AinativeWordmark />
        </Link>

        {/* Tier 1 = TAB idiom: the active section shows a cyan bottom-border
            that sits on the header's own bottom edge (-mb-px), so the underline
            visually connects the tab to the tier-2 row it controls. Distinct
            from tier 2's pill/fill LINK-selection idiom below — different shapes
            of emphasis, so the two tiers read as a hierarchy, not two rows of
            the same control. */}
        <nav
          aria-label="Primary"
          role="tablist"
          className="-mb-px flex min-w-0 flex-1 items-stretch gap-1 self-stretch overflow-x-auto"
        >
          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const sectionActive = group.id === activeId;
            return (
              <Link
                key={group.id}
                href={group.href}
                role="tab"
                aria-selected={sectionActive}
                aria-current={sectionActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium transition-colors",
                  sectionActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <GroupIcon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    sectionActive ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                {group.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Settings — icon-only gear in the utility cluster. Active = cyan. */}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            aria-current={settingsActive ? "page" : undefined}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
              settingsActive
                ? "text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Settings className="h-4 w-4 shrink-0" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={openCommandPalette}
            aria-label="Open command palette (⌘K)"
            className="hidden h-8 items-center rounded-md border border-border/60 px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
          >
            <kbd className="font-mono">⌘K</kbd>
          </button>
          <ThemeToggle />
          <span className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
            <AuthStatusDot />
          </span>
        </div>
      </div>

      {/* Tier 2 — children of the active section, always visible. */}
      <div className="flex h-11 flex-none items-center border-t border-border/60 px-4">
        <ul
          aria-label={`${activeGroup.label} sections`}
          className="flex min-w-0 items-center gap-1 overflow-x-auto"
        >
          {tierTwo.map((item) => (
            <TierTwoLink key={item.href} item={item} pathname={pathname} />
          ))}
          {overflowCount > 0 && (
            <li className="flex">
              <Link
                href="/apps"
                title={`${overflowCount} more app${overflowCount === 1 ? "" : "s"}`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden />
                {`+${overflowCount} more`}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </header>
  );
}
