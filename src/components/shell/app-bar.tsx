"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AinativeWordmark } from "@/components/shared/ainative-wordmark";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { AuthStatusDot } from "@/components/settings/auth-status-dot";
import { UnreadBadge } from "@/components/notifications/unread-badge";
import {
  NAV_GROUPS,
  isItemActive,
  activeGroupId,
  type NavGroup,
  type NavGroupId,
} from "./nav-items";

// The Arena app bar with an IN-BAR horizontal accordion (operator's model). The
// bar shows the 5 group buttons; clicking one slides its children open inline,
// pushing siblings right, and slides any previously-open group closed — so at
// most one group's children (≤4) plus the 5 group buttons are visible at once.
// Each child shows a single-line label (icon + title); its tip survives only as
// the native title tooltip, so children stay narrow on small viewports. Active
// child = cyan fill (the one action color). No drawer, no separate primary tabs:
// the whole IA lives in the bar.

function openCommandPalette() {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
  );
}

function GroupAccordion({
  group,
  open,
  onToggle,
  pathname,
}: {
  group: NavGroup;
  open: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const GroupIcon = group.icon;
  const groupActive = group.items.some((item) => isItemActive(item, pathname));

  return (
    <div className="flex items-stretch">
      {/* Group button — toggles its own children open/closed. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex h-9 items-center gap-1.5 self-center rounded-md px-2.5 text-sm font-medium transition-colors",
          open || groupActive
            ? "text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <GroupIcon
          className={cn(
            "h-4 w-4 shrink-0",
            groupActive ? "text-primary" : "text-muted-foreground/70",
          )}
          aria-hidden
        />
        {group.label}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/50 transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {/* Children — horizontal slide via grid-cols 0fr→1fr (mirrors the old
          sidebar's grid-rows accordion, but on the inline axis). */}
      <div
        className={cn(
          "grid transition-[grid-template-columns] duration-200 ease-in-out",
          open ? "grid-cols-[1fr]" : "grid-cols-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <ul className="flex h-full items-center gap-1 pr-1 pl-0.5">
            {group.items.map((item) => {
              const active = isItemActive(item, pathname);
              const Icon = item.icon;
              return (
                <li key={item.href} className="flex">
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
                        active
                          ? "text-primary-foreground"
                          : "text-muted-foreground/70",
                      )}
                      aria-hidden
                    />
                    {/* Single-line label: the tip (item.description) is dropped
                        from the bar to keep each child pill narrow on small
                        viewports — it survives as the native title tooltip. */}
                    <span className="flex items-center gap-1.5 text-[13px] font-medium leading-tight">
                      {item.title}
                      {item.badge && (
                        <span
                          className={
                            active ? "[&_*]:!text-primary-foreground" : ""
                          }
                        >
                          <UnreadBadge />
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function AppBar() {
  const pathname = usePathname();
  // Default the open group to whichever owns the current route; re-sync on
  // navigation so deep links land with the right group already expanded.
  const routeGroup = activeGroupId(pathname);
  const [openGroup, setOpenGroup] = useState<NavGroupId | null>(routeGroup);

  useEffect(() => {
    setOpenGroup(routeGroup);
  }, [routeGroup]);

  return (
    <header className="sticky top-0 z-30 flex h-16 flex-none items-center gap-3 border-b border-border bg-[var(--surface-1)] px-4">
      <Link
        href="/"
        aria-label="Orionfold Relay home"
        className="flex shrink-0 items-center"
      >
        <AinativeWordmark />
      </Link>

      <nav
        aria-label="Primary"
        className="flex min-w-0 flex-1 items-stretch gap-0.5 overflow-x-auto"
      >
        {NAV_GROUPS.map((group) => (
          <GroupAccordion
            key={group.id}
            group={group}
            open={openGroup === group.id}
            onToggle={() =>
              setOpenGroup((prev) => (prev === group.id ? null : group.id))
            }
            pathname={pathname}
          />
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2">
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
    </header>
  );
}
