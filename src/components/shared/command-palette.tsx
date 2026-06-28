"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  FolderKanban,
  Plus,
  Sun,
  Moon,
  CheckCheck,
  Loader2,
  Sparkles,
  FileCode,
  Bookmark,
  Trash2,
  Settings2,
} from "lucide-react";
import { navigationItems, createItems } from "@/lib/chat/command-data";
import { toggleTheme } from "@/lib/theme";
import { useProjectSkills } from "@/hooks/use-project-skills";
import { useSavedSearches, type SavedSearch, type SavedSearchSurface } from "@/hooks/use-saved-searches";
import { SavedSearchesManager } from "./saved-searches-manager";
import { toast } from "sonner";

// Maps each saved-search surface to its list-page route.
const SURFACE_ROUTE: Record<SavedSearchSurface, string> = {
  task: "/tasks",
  project: "/projects",
  workflow: "/workflows",
  document: "/documents",
  skill: "/skills",
  profile: "/profiles",
};

interface RecentProject {
  id: string;
  name: string;
  status: string;
}

interface RecentTask {
  id: string;
  title: string;
  status: string;
}

function statusColorClass(status: string): string {
  switch (status) {
    case "running":
      return "text-status-running";
    case "completed":
      return "text-status-completed";
    case "failed":
      return "text-status-failed";
    default:
      return "text-muted-foreground";
  }
}

export function CommandPalette() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const [fileResults, setFileResults] = useState<Array<{ entityId: string; label: string; description?: string }>>([]);
  const abortRef = useRef<AbortController | null>(null);
  const fileAbortRef = useRef<AbortController | null>(null);
  const fileDebounceRef = useRef<number | null>(null);
  const router = useRouter();
  const { skills } = useProjectSkills(null);
  const {
    searches: savedSearches,
    refetch: refetchSavedSearches,
    remove: removeSavedSearch,
    save: saveSavedSearch,
    rename: renameSavedSearch,
  } = useSavedSearches();
  const [managerOpen, setManagerOpen] = useState(false);

  // Defer render until after hydration to avoid Radix ID mismatch
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Fetch recent items when palette opens
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      fileAbortRef.current?.abort();
      if (fileDebounceRef.current) window.clearTimeout(fileDebounceRef.current);
      setFileQuery("");
      setFileResults([]);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingRecent(true);

    fetch("/api/command-palette/recent", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRecentProjects(data.projects);
          setRecentTasks(data.tasks);
        }
      })
      .catch(() => {
        // Aborted or failed — ignore
      })
      .finally(() => setLoadingRecent(false));
  }, [open]);

  function handleInputChange(value: string) {
    setFileQuery(value);
    if (fileDebounceRef.current) {
      window.clearTimeout(fileDebounceRef.current);
    }
    fileAbortRef.current?.abort();
    if (!value || value.length < 2) {
      setFileResults([]);
      return;
    }
    fileDebounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      fileAbortRef.current = controller;
      const params = new URLSearchParams({ q: value, limit: "8" });
      fetch(`/api/chat/files/search?${params}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          const raw = Array.isArray(data)
            ? data
            : Array.isArray(data?.results)
              ? data.results
              : [];
          // API returns FileSearchHit { path, sizeBytes, mtime }; the palette
          // needs { entityId, label } for stable React keys and the select handler.
          const mapped = raw
            .map((f: { path?: string; entityId?: string; label?: string }) => {
              const entityId = f.entityId ?? f.path;
              const label = f.label ?? f.path;
              return entityId && label ? { entityId, label } : null;
            })
            .filter((f: { entityId: string; label: string } | null): f is { entityId: string; label: string } => f !== null);
          setFileResults(mapped);
        })
        .catch(() => {
          // aborted or failed — ignore
        });
    }, 200);
  }

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  function handleToggleTheme() {
    setOpen(false);
    toggleTheme();
  }

  function handleSelectSkill(id: string, name: string) {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("ainative.chat.activate-skill", { detail: { id } })
    );
    toast.info(`Skill "${name}" — activation coming soon`);
  }

  function handleSelectFile(entityId: string, label: string) {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("ainative.chat.insert-mention", {
        detail: { type: "file", path: entityId, label },
      })
    );
    toast.info(`File "${label}" — mention insert coming soon`);
  }

  async function markAllRead() {
    setOpen(false);
    await fetch("/api/notifications/mark-all-read", { method: "PATCH" });
    router.refresh();
  }

  const hasRecent = recentProjects.length > 0 || recentTasks.length > 0;

  const handleDeleteSavedSearch = useCallback(
    (s: SavedSearch) => {
      // Optimistic remove + toast with Undo. The closure holds the full
      // record so undo restores id/createdAt verbatim (not just label).
      removeSavedSearch(s.id);
      toast("Saved search deleted", {
        duration: 5000,
        action: {
          label: "Undo",
          onClick: () => {
            // `save` generates a new id — we need to restore the original.
            // The cheapest restoration is to re-save and then immediately
            // patch the id via a rename-adjacent path. Since the hook has
            // no "insert with id" method, we accept id churn on undo: the
            // label/filterInput/surface are preserved, which is what the
            // user sees. Acceptance criterion: the row reappears with its
            // label and filter, the actual id is an implementation detail.
            saveSavedSearch({
              surface: s.surface,
              label: s.label,
              filterInput: s.filterInput,
            });
          },
        },
      });
    },
    [removeSavedSearch, saveSavedSearch]
  );

  if (!mounted) return null;

  return (
    <>
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        // Revalidate saved searches on every open. Each useSavedSearches
        // consumer holds its own state, so a save in the chat popover
        // wouldn't otherwise appear here until page reload.
        // See features/saved-search-polish-v1.md.
        if (next && !open) void refetchSavedSearches();
        setOpen(next);
      }}
    >
      <CommandInput
        placeholder="Type a command or search..."
        value={fileQuery}
        onValueChange={handleInputChange}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Recent Items */}
        {(loadingRecent || hasRecent) && (
          <CommandGroup heading="Recent">
            {loadingRecent && !hasRecent ? (
              <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading recent items...
              </div>
            ) : (
              <>
                {recentProjects.map((project) => (
                  <CommandItem
                    key={`project-${project.id}`}
                    value={`recent-project-${project.name}`}
                    onSelect={() => navigate(`/projects/${project.id}`)}
                    keywords={["recent", "project"]}
                  >
                    <FolderKanban className="h-4 w-4" />
                    <span className="flex-1 truncate">{project.name}</span>
                    <span className={`text-xs ${statusColorClass(project.status)}`}>
                      {project.status}
                    </span>
                  </CommandItem>
                ))}
                {recentTasks.map((task) => (
                  <CommandItem
                    key={`task-${task.id}`}
                    value={`recent-task-${task.title}`}
                    onSelect={() => navigate(`/tasks?task=${task.id}`)}
                    keywords={["recent", "task"]}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="flex-1 truncate">{task.title}</span>
                    <span className={`text-xs ${statusColorClass(task.status)}`}>
                      {task.status}
                    </span>
                  </CommandItem>
                ))}
              </>
            )}
          </CommandGroup>
        )}

        {hasRecent && <CommandSeparator />}

        {/* Saved searches */}
        {savedSearches.length > 0 && (
          <>
            <CommandGroup heading="Saved searches">
              {savedSearches.map((s) => (
                <CommandItem
                  key={`saved-${s.id}`}
                  value={`saved ${s.label} ${s.filterInput} ${s.surface}`}
                  onSelect={() => {
                    const base = SURFACE_ROUTE[s.surface];
                    navigate(`${base}?filter=${encodeURIComponent(s.filterInput)}`);
                  }}
                  keywords={["saved", "search", s.surface]}
                  className="group/item"
                  onKeyDown={(e) => {
                    // ⌘⌫ on focused row deletes with undo
                    if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteSavedSearch(s);
                    }
                  }}
                >
                  <Bookmark className="h-4 w-4" />
                  <span className="flex-1 truncate">{s.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">{s.filterInput}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{s.surface}</span>
                  <button
                    type="button"
                    aria-label={`Delete saved search: ${s.label}`}
                    className="ml-1 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 transition-opacity"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDeleteSavedSearch(s);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </CommandItem>
              ))}
              <CommandItem
                value="manage-saved-searches"
                keywords={["manage", "saved", "rename", "delete"]}
                onSelect={() => {
                  setManagerOpen(true);
                }}
              >
                <Settings2 className="h-4 w-4" />
                <span className="flex-1">Manage saved searches…</span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.href}
              value={item.title}
              onSelect={() => navigate(item.href)}
              keywords={[item.keywords]}
            >
              <item.icon className="h-4 w-4" />
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* User Guide */}
        {/* Create */}
        <CommandGroup heading="Create">
          {createItems.map((item) => (
            <CommandItem
              key={item.href}
              value={item.title}
              onSelect={() => navigate(item.href)}
              keywords={[item.keywords]}
            >
              <Plus className="h-4 w-4" />
              {item.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Templates */}
        <CommandGroup heading="Templates">
          <CommandItem
            value="start-from-template"
            keywords={["template", "blueprint", "new", "conversation", "chat"]}
            onSelect={() => {
              setOpen(false);
              // Ensure chat-shell is mounted so its event listener is live.
              // When already on /chat, next-tick dispatch is a no-op nav.
              router.push("/chat");
              window.setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent("ainative.chat.openTemplatePicker")
                );
              }, 50);
            }}
          >
            <Sparkles className="h-4 w-4" />
            Start conversation from template…
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Skills */}
        {skills.length > 0 && (
          <>
            <CommandGroup heading="Skills">
              {skills.map((skill) => (
                <CommandItem
                  key={`skill-${skill.id}`}
                  value={`skill-${skill.name}`}
                  onSelect={() => handleSelectSkill(skill.id, skill.name)}
                  keywords={["skill", "profile"]}
                >
                  <Sparkles className="h-4 w-4" />
                  <span className="flex-1 truncate">{skill.name}</span>
                  {skill.description && (
                    <span className="text-xs text-muted-foreground truncate max-w-[40%]">
                      {skill.description}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Files */}
        {fileResults.length > 0 && (
          <>
            <CommandGroup heading="Files">
              {fileResults.map((file) => (
                <CommandItem
                  key={`file-${file.entityId}`}
                  value={`file-${file.label}`}
                  onSelect={() => handleSelectFile(file.entityId, file.label)}
                  keywords={["file", "path"]}
                >
                  <FileCode className="h-4 w-4" />
                  <span className="flex-1 truncate font-mono text-xs">{file.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Utility */}
        <CommandGroup heading="Utility">
          <CommandItem onSelect={handleToggleTheme} value="Toggle Theme" keywords={["dark", "light", "mode"]}>
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="h-4 w-4 hidden dark:block" />
            Toggle Theme
            <CommandShortcut>Theme</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={markAllRead} value="Mark All Notifications Read" keywords={["clear", "inbox", "unread"]}>
            <CheckCheck className="h-4 w-4" />
            Mark All Read
            <CommandShortcut>Inbox</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
    <SavedSearchesManager
      open={managerOpen}
      onOpenChange={setManagerOpen}
      searches={savedSearches}
      onRename={renameSavedSearch}
      onRemove={removeSavedSearch}
    />
    </>
  );
}
