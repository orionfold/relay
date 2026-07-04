"use client";

import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useShortcuts, useGlobalKeyboardListener, useShortcutList } from "@/hooks/use-shortcuts";
import { ShortcutHint } from "@/components/shared/shortcut-hint";
import type { ShortcutEntry } from "@/lib/keyboard/shortcut-registry";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * GlobalShortcuts — registers app-wide keyboard shortcuts and
 * renders a ⌘/ cheat sheet overlay.
 *
 * Mount once in the root layout.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  const toggleCheatSheet = useCallback(() => {
    setCheatSheetOpen((prev) => !prev);
  }, []);

  const shortcuts: ShortcutEntry[] = useMemo(
    () => [
      // Navigation
      { id: "nav-home", keys: "g h", description: "Go to Home", scope: "global", category: "Navigation", handler: () => router.push("/") },
      { id: "nav-tasks", keys: "g t", description: "Go to Tasks", scope: "global", category: "Navigation", handler: () => router.push("/tasks") },
      { id: "nav-inbox", keys: "g i", description: "Go to Inbox", scope: "global", category: "Navigation", handler: () => router.push("/inbox") },
      { id: "nav-monitor", keys: "g m", description: "Go to Monitor", scope: "global", category: "Navigation", handler: () => router.push("/monitor") },
      { id: "nav-projects", keys: "g p", description: "Go to Projects", scope: "global", category: "Navigation", handler: () => router.push("/projects") },
      { id: "nav-workflows", keys: "g w", description: "Go to Workflows", scope: "global", category: "Navigation", handler: () => router.push("/workflows") },
      { id: "nav-documents", keys: "g o", description: "Go to Documents", scope: "global", category: "Navigation", handler: () => router.push("/documents") },
      { id: "nav-profiles", keys: "g r", description: "Go to Profiles", scope: "global", category: "Navigation", handler: () => router.push("/agents") },
      { id: "nav-schedules", keys: "g s", description: "Go to Schedules", scope: "global", category: "Navigation", handler: () => router.push("/schedules") },
      { id: "nav-costs", keys: "g c", description: "Go to Costs", scope: "global", category: "Navigation", handler: () => router.push("/costs") },
      { id: "nav-settings", keys: "g ,", description: "Go to Settings", scope: "global", category: "Navigation", handler: () => router.push("/settings") },
      // Actions
      { id: "create-task", keys: "c t", description: "Create new task", scope: "global", category: "Actions", handler: () => router.push("/tasks/new") },
      { id: "create-workflow", keys: "c w", description: "Create new workflow", scope: "global", category: "Actions", handler: () => router.push("/workflows/new") },
      // System
      { id: "cheat-sheet", keys: "⌘ /", description: "Show keyboard shortcuts", scope: "global", category: "System", handler: toggleCheatSheet },
    ],
    [router, toggleCheatSheet]
  );

  useShortcuts(shortcuts);
  useGlobalKeyboardListener("global");

  return <CheatSheet open={cheatSheetOpen} onOpenChange={setCheatSheetOpen} />;
}

function CheatSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allShortcuts = useShortcutList();

  // Group by category
  const categories = new Map<string, ShortcutEntry[]>();
  for (const entry of allShortcuts) {
    const list = categories.get(entry.category) ?? [];
    list.push(entry);
    categories.set(entry.category, list);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Press these key combinations to navigate quickly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 mt-2">
          {Array.from(categories.entries()).map(([category, entries]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {category}
              </h3>
              <div className="space-y-1">
                {entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm">{entry.description}</span>
                    <ShortcutHint keys={entry.keys} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
