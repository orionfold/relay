"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  FolderKanban,
  ListTodo,
  GitBranch,
  FileText,
  FileCode,
  Bot,
  Clock,
  Loader2,
  Pin,
  PinOff,
  Bookmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import {
  getToolCatalogWithSkills,
  groupToolCatalog,
  TOOL_GROUP_ICONS,
} from "@/lib/chat/tool-catalog";
import type { AutocompleteMode, EntitySearchResult } from "@/hooks/use-chat-autocomplete";
import { CommandTabBar } from "./command-tab-bar";
import { partitionCatalogByTab, type CommandTabId } from "@/lib/chat/command-tabs";
import { useEnrichedSkills } from "@/hooks/use-enriched-skills";
import { useRecentUserMessages } from "@/hooks/use-recent-user-messages";
import { SkillRow } from "./skill-row";
import { computeRecommendation } from "@/lib/environment/skill-recommendations";
import { browserLocalStore, activeDismissedIds, saveDismissal } from "@/lib/chat/dismissals";
import { useChatSession } from "@/components/chat/chat-session-provider";
import type { EnrichedSkill } from "@/lib/environment/skill-enrichment";
import { parseFilterInput, matchesClauses } from "@/lib/filters/parse";
import type { FilterClause } from "@/lib/filters/parse";
import { FilterHint } from "@/components/shared/filter-hint";
import { cleanFilterInput } from "@/lib/chat/clean-filter-input";
import { usePinnedEntries, type PinnedEntry } from "@/hooks/use-pinned-entries";
import { useSavedSearches, type SavedSearch, type SavedSearchSurface } from "@/hooks/use-saved-searches";
import { useActiveSkills } from "@/hooks/use-active-skills";
import { SkillCompositionConflictDialog } from "./skill-composition-conflict-dialog";
import type { SkillConflict } from "@/lib/chat/skill-conflict";

interface ChatCommandPopoverProps {
  open: boolean;
  mode: AutocompleteMode;
  query: string;
  anchorRect: { top: number; left: number; height: number } | null;
  entityResults: EntitySearchResult[];
  entityLoading: boolean;
  projectProfiles?: Array<{ id: string; name: string; description: string }>;
  activeTab: CommandTabId;
  onTabChange: (tab: CommandTabId) => void;
  onSelect: (item: {
    type: "slash" | "mention";
    id: string;
    label: string;
    text?: string;
    entityType?: string;
    entityId?: string;
  }) => void;
  onClose: () => void;
  onApplySavedSearch?: (filterInput: string) => void;
  /** Active conversation id — used for skill composition HTTP calls. */
  conversationId?: string | null;
}

const ENTITY_ICONS: Record<string, LucideIcon> = {
  project: FolderKanban,
  task: ListTodo,
  workflow: GitBranch,
  document: FileText,
  profile: Bot,
  schedule: Clock,
  file: FileCode,
};

const ENTITY_LABELS: Record<string, string> = {
  project: "Projects",
  task: "Tasks",
  workflow: "Workflows",
  document: "Documents",
  profile: "Profiles",
  schedule: "Schedules",
  file: "Files",
};

function groupByType(results: EntitySearchResult[]): Record<string, EntitySearchResult[]> {
  const groups: Record<string, EntitySearchResult[]> = {};
  for (const r of results) {
    if (!groups[r.entityType]) groups[r.entityType] = [];
    groups[r.entityType].push(r);
  }
  return groups;
}

export function ChatCommandPopover({
  open,
  mode,
  query,
  anchorRect,
  entityResults,
  entityLoading,
  projectProfiles,
  activeTab,
  onTabChange,
  onSelect,
  onClose,
  onApplySavedSearch,
  conversationId,
}: ChatCommandPopoverProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, onClose]);

  // -----------------------------------------------------------------------
  // Skill composition state
  // -----------------------------------------------------------------------
  const { activeIds, supportsComposition, maxActive, refetch: refetchActive } =
    useActiveSkills(conversationId ?? null);

  // When activate returns requiresConfirmation, we stash the pending request
  // and open the conflict dialog for the user to decide.
  const [pendingAdd, setPendingAdd] = useState<{
    skillId: string;
    skillName: string;
    conflicts: SkillConflict[];
  } | null>(null);

  const callActivate = useCallback(
    async (skillId: string, skillName: string, mode: "replace" | "add", force = false) => {
      if (!conversationId) return;
      const r = await fetch(
        `/api/chat/conversations/${conversationId}/skills/activate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skillId, mode, force }),
        }
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as Record<string, unknown>;
        toast.error(typeof body.error === "string" ? body.error : "Failed to add skill");
        return;
      }
      const body = await r.json() as Record<string, unknown>;
      if (body.requiresConfirmation) {
        setPendingAdd({
          skillId,
          skillName,
          conflicts: (body.conflicts as SkillConflict[]) ?? [],
        });
        return;
      }
      await refetchActive();
      const activeCount = Array.isArray(body.activeSkillIds)
        ? (body.activeSkillIds as string[]).length
        : 1;
      toast.success(`Added ${skillName}. ${activeCount} skill${activeCount !== 1 ? "s" : ""} active`);
    },
    [conversationId, refetchActive]
  );

  const callDeactivate = useCallback(async () => {
    if (!conversationId) return;
    await fetch(`/api/chat/conversations/${conversationId}/skills/deactivate`, {
      method: "POST",
    });
    await refetchActive();
  }, [conversationId, refetchActive]);

  // Enriched skills — only fetch when popover is open in slash mode
  const enrichedSkills = useEnrichedSkills(open && mode === "slash");

  // Session context for recommendation
  const { activeId } = useChatSession();
  const recentMessages = useRecentUserMessages(activeId, 20);

  const dismissStore = useMemo(
    () => browserLocalStore("ainative.chat.dismissed-suggestions"),
    []
  );

  const [dismissTick, setDismissTick] = useState(0);

  const dismissedIds = useMemo(
    () =>
      activeId
        ? activeDismissedIds(dismissStore, activeId)
        : new Set<string>(),
    [dismissStore, activeId, dismissTick]
  );

  const recommended = useMemo(
    () =>
      computeRecommendation(enrichedSkills, recentMessages, {
        dismissedIds,
      }),
    [enrichedSkills, recentMessages, dismissedIds]
  );

  // Pinned entries persist under settings.chat.pinnedEntries. Hook self-
  // fetches on mount and sends optimistic PUTs on mutation.
  const { pins, isPinned, pin, unpin } = usePinnedEntries();

  // Parse `#key:value` filter clauses from the query. Relevant for mention
  // mode — slash mode does its own tab-based grouping and doesn't currently
  // consume free-text filters.
  const parsed = useMemo(() => parseFilterInput(query), [query]);

  // Pre-filter entity results by known filter keys. Unknown keys pass through
  // per the parser contract (silently skipped). cmdk still runs its own
  // fuzzy match on top using `parsed.rawQuery`.
  const filteredEntityResults = useMemo(() => {
    if (parsed.clauses.length === 0) return entityResults;
    return entityResults.filter((r) =>
      matchesClauses(r, parsed.clauses, {
        // `#status:blocked` — case-insensitive substring match so partial
        // values like `#status:block` also hit (helps while typing).
        status: (item, value) =>
          typeof item.status === "string" &&
          item.status.toLowerCase().includes(value.toLowerCase()),
        // `#type:task` — exact match on the entity-type discriminator.
        type: (item, value) =>
          item.entityType.toLowerCase() === value.toLowerCase(),
      })
    );
  }, [entityResults, parsed.clauses]);

  const { forSurface, save } = useSavedSearches();

  // Surface inference for saved-search scoping. In mention mode, look at
  // the first filtered entity result's type; fall back to "task" when the
  // list is empty so the "Save this view" button still has a valid target.
  // Slash-mode surface inference is deferred — Saved group renders in
  // mention mode only in v2.
  const currentSurface: SavedSearchSurface = useMemo(() => {
    if (mode !== "mention") return "task";
    const firstType = filteredEntityResults[0]?.entityType as SavedSearchSurface | undefined;
    if (firstType && ["task", "project", "workflow", "document", "skill", "profile"].includes(firstType)) {
      return firstType;
    }
    return "task";
  }, [mode, filteredEntityResults]);

  const savedForSurface = useMemo(
    () => forSurface(currentSurface),
    [forSurface, currentSurface]
  );

  // Filter enriched skills by `#scope:` and `#type:` clauses so users can
  // narrow the skills tab with e.g. `/skills #scope:project` or
  // `/skills #type:claude-agent-sdk`. Unknown clauses pass through silently.
  const filteredEnrichedSkills = useMemo(() => {
    if (parsed.clauses.length === 0) return enrichedSkills;
    return enrichedSkills.filter((skill) =>
      matchesClauses(skill, parsed.clauses, {
        // `#scope:project` / `#scope:user` — exact case-insensitive match.
        scope: (s, v) => s.scope.toLowerCase() === v.toLowerCase(),
        // `#type:skill-name` — substring match on the tool name.
        type: (s, v) => (s.tool ?? "").toLowerCase().includes(v.toLowerCase()),
      })
    );
  }, [enrichedSkills, parsed.clauses]);

  if (!open || !anchorRect || !mode) return null;

  // Position above the caret
  const style: React.CSSProperties = {
    position: "fixed",
    left: Math.max(8, anchorRect.left),
    bottom: window.innerHeight - anchorRect.top + 4,
    zIndex: 50,
    width: 360,
  };

  const content = (
    <div
      ref={containerRef}
      style={style}
      data-chat-autocomplete=""
      className="rounded-lg border bg-popover text-popover-foreground shadow-lg animate-in fade-in-0"
    >
      <Command shouldFilter loop>
        {/* Hidden input for cmdk filtering. In mention mode we pass the
            filter-stripped `rawQuery` so cmdk's fuzzy match doesn't see
            `#key:value` tokens and score every entity to zero. */}
        <div className="sr-only">
          <CommandInput value={mode === "mention" ? parsed.rawQuery : query} />
        </div>

        {mode === "slash" ? (
          <>
            <CommandTabBar activeTab={activeTab} onChange={onTabChange} />
            {/* Active skill count indicator — shown only on the skills tab. */}
            {activeTab === "skills" && conversationId && (
              <div className="px-3 py-1.5 text-xs text-muted-foreground border-b">
                {activeIds.length} of {maxActive} active
              </div>
            )}
            <CommandList className="max-h-[320px]">
              <FilterHint inputValue={query} storageKey="ainative.filter-hint.dismissed" />
              {activeTab !== "entities" && (
                <CommandEmpty>No matching tools</CommandEmpty>
              )}
              <div
                role="tabpanel"
                id={`command-tabpanel-${activeTab}`}
                aria-labelledby={`command-tab-${activeTab}`}
              >
                <ToolCatalogItems
                  onSelect={onSelect}
                  projectProfiles={projectProfiles}
                  activeTab={activeTab}
                  enrichedSkills={filteredEnrichedSkills}
                  totalSkillCount={enrichedSkills.length}
                  recommendedId={recommended?.id ?? null}
                  onDismissRecommendation={
                    activeId
                      ? (skillId) => {
                          saveDismissal(dismissStore, activeId, skillId);
                          setDismissTick((t) => t + 1);
                        }
                      : undefined
                  }
                  activeSkillIds={activeIds}
                  supportsComposition={supportsComposition}
                  maxActive={maxActive}
                  onAddSkill={
                    conversationId
                      ? (skillId, skillName) =>
                          callActivate(skillId, skillName, "add")
                      : undefined
                  }
                  onDeactivate={conversationId ? callDeactivate : undefined}
                />
              </div>
            </CommandList>
          </>
        ) : (
          <CommandList className="max-h-[320px]">
            <CommandEmpty>No matching entities</CommandEmpty>
            <MentionItems
              results={filteredEntityResults}
              loading={entityLoading}
              onSelect={onSelect}
              pins={pins}
              isPinned={isPinned}
              onPin={pin}
              onUnpin={unpin}
              rawQuery={parsed.rawQuery}
              savedSearches={savedForSurface}
              onApplySavedSearch={(filterInput) => onApplySavedSearch?.(filterInput)}
              clauses={parsed.clauses}
            />
            {parsed.clauses.length > 0 && (() => {
              // Persist the cleaned filterInput so saved searches don't
              // carry the mention-trigger residue (e.g. `task: `) into
              // their stored value. See features/saved-search-polish-v1.md.
              const persistedFilterInput = cleanFilterInput(
                parsed.clauses,
                parsed.rawQuery
              );
              return (
                <SaveViewFooter
                  surface={currentSurface}
                  clauses={parsed.clauses}
                  filterInput={persistedFilterInput}
                  onSave={(label) =>
                    save({
                      surface: currentSurface,
                      label:
                        label ||
                        parsed.clauses
                          .map((c) => `#${c.key}:${c.value}`)
                          .join(" "),
                      filterInput: persistedFilterInput,
                    })
                  }
                />
              );
            })()}
          </CommandList>
        )}
      </Command>
    </div>
  );

  return (
    <>
      {createPortal(content, document.body)}
      {pendingAdd && (
        <SkillCompositionConflictDialog
          open={!!pendingAdd}
          onOpenChange={(o) => { if (!o) setPendingAdd(null); }}
          newSkillName={pendingAdd.skillName}
          conflicts={pendingAdd.conflicts}
          onConfirm={() => {
            void callActivate(pendingAdd.skillId, pendingAdd.skillName, "add", true);
          }}
        />
      )}
    </>
  );
}

function ToolCatalogItems({
  onSelect,
  projectProfiles,
  activeTab,
  enrichedSkills,
  totalSkillCount,
  recommendedId,
  onDismissRecommendation,
  activeSkillIds,
  supportsComposition,
  maxActive,
  onAddSkill,
  onDeactivate,
}: {
  onSelect: ChatCommandPopoverProps["onSelect"];
  projectProfiles?: ChatCommandPopoverProps["projectProfiles"];
  activeTab: CommandTabId;
  /** Filtered list of skills to render (may be a subset of all skills). */
  enrichedSkills: EnrichedSkill[];
  /** Total number of skills before any filter is applied — used for empty-state copy. */
  totalSkillCount: number;
  recommendedId?: string | null;
  onDismissRecommendation?: (skillId: string) => void;
  /** Currently active skill IDs for this conversation. */
  activeSkillIds?: string[];
  /** Whether the current runtime supports composing 2+ skills. */
  supportsComposition?: boolean;
  /** Max simultaneously-active skills for this runtime. */
  maxActive?: number;
  /** Called when the user clicks "+ Add" on an inactive skill. */
  onAddSkill?: (skillId: string, skillName: string) => void;
  /** Called when the user deactivates the current skill. */
  onDeactivate?: () => void;
}) {
  const catalog = getToolCatalogWithSkills({
    includeBrowser: true,
    projectProfiles,
  });
  const parts = partitionCatalogByTab(catalog);
  const entries = parts[activeTab];

  if (activeTab === "entities") {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground text-center">
        Type <span className="font-mono text-foreground">@</span> to reference projects, tasks, documents, or files.
      </div>
    );
  }

  // When the skills tab has enriched data, render the enriched list
  if (activeTab === "skills" && enrichedSkills.length > 0) {
    const activeSet = new Set(activeSkillIds ?? []);
    const resolvedMax = maxActive ?? 1;
    const atCapacity = (activeSkillIds?.length ?? 0) >= resolvedMax;

    return (
      <CommandGroup heading="Skills">
        {enrichedSkills.map((skill) => {
          const isActive = activeSet.has(skill.id);
          // Show "+ Add" only when composition is available, slot is free, and
          // we have a conversationId to POST to.
          const canAdd =
            !isActive &&
            supportsComposition &&
            !atCapacity &&
            !!onAddSkill;
          // Show disabled "+" when at capacity or runtime doesn't support composition.
          const showDisabled = !isActive && !canAdd && !!onAddSkill;
          const disabledReason = atCapacity
            ? `Max ${resolvedMax} skills active`
            : "Single skill only on this runtime. Switch runtime to compose";

          return (
            <SkillRow
              key={skill.id}
              skill={skill}
              recommended={recommendedId === skill.id}
              onDismissRecommendation={
                recommendedId === skill.id
                  ? () => onDismissRecommendation?.(skill.id)
                  : undefined
              }
              onSelect={() =>
                onSelect({
                  type: "slash",
                  id: skill.name,
                  label: skill.name,
                  text: `Use the ${skill.name} profile: `,
                })
              }
              isActive={isActive}
              addButton={
                canAdd ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 px-2 text-[10px] shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddSkill(skill.id, skill.name);
                    }}
                  >
                    + Add
                  </Button>
                ) : showDisabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    aria-label={disabledReason}
                    title={disabledReason}
                    className="ml-auto h-6 px-2 text-[10px] shrink-0"
                  >
                    + Add
                  </Button>
                ) : undefined
              }
              onDeactivate={isActive && onDeactivate ? onDeactivate : undefined}
            />
          );
        })}
      </CommandGroup>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-muted-foreground text-center">
        {activeTab === "skills"
          ? totalSkillCount > 0
            ? "No skills match these filters."
            : "No skills available yet."
          : "Nothing here."}
      </div>
    );
  }

  const groups = groupToolCatalog(entries);
  const groupNames = Object.keys(groups);

  return (
    <>
      {groupNames.map((groupName) => {
        const items = groups[groupName];
        if (!items?.length) return null;
        const GroupIcon = TOOL_GROUP_ICONS[groupName as keyof typeof TOOL_GROUP_ICONS] ?? FileText;
        return (
          <CommandGroup key={groupName} heading={groupName}>
            {items.map((entry) => (
              <CommandItem
                key={entry.name}
                value={`${entry.name} ${entry.description} ${entry.group}`}
                onSelect={() =>
                  onSelect({
                    type: "slash",
                    id: entry.name,
                    label: entry.name,
                    text: entry.behavior === "execute_immediately"
                      ? entry.name
                      : entry.group === "Skills"
                          ? `Use the ${entry.name} profile: `
                          : `Use ${entry.name} to `,
                  })
                }
              >
                <GroupIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-col min-w-0">
                  <span className="truncate text-sm font-medium">{entry.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {entry.description}
                  </span>
                </div>
                {entry.paramHint && (
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60 font-mono">
                    {entry.paramHint}
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        );
      })}
    </>
  );
}

function MentionItems({
  results,
  loading,
  onSelect,
  pins,
  isPinned,
  onPin,
  onUnpin,
  rawQuery,
  savedSearches,
  onApplySavedSearch,
  clauses,
}: {
  results: EntitySearchResult[];
  loading: boolean;
  onSelect: ChatCommandPopoverProps["onSelect"];
  pins: PinnedEntry[];
  isPinned: (id: string) => boolean;
  onPin: (entry: Omit<PinnedEntry, "pinnedAt">) => void;
  onUnpin: (id: string) => void;
  rawQuery: string;
  savedSearches: SavedSearch[];
  onApplySavedSearch?: (filterInput: string) => void;
  clauses: FilterClause[];
}) {
  if (loading && results.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading...
      </div>
    );
  }

  // Pins render from the standalone pin records (denormalized label/status),
  // so they surface even when outside the current entities/search window.
  // Filter pins by `rawQuery` so typing a query narrows pins too.
  const q = rawQuery.toLowerCase();
  const visiblePins =
    q.length === 0
      ? pins
      : pins.filter(
          (p) =>
            p.label.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q)
        );

  // Hide pinned items from their regular type group so they don't render
  // twice on the same popover open.
  const unpinnedResults = results.filter((r) => !isPinned(r.entityId));
  const grouped = groupByType(unpinnedResults);
  const entityTypes = Object.keys(grouped);

  if (savedSearches.length === 0 && visiblePins.length === 0 && entityTypes.length === 0) {
    if (clauses.length > 0) {
      return (
        <CommandEmpty>
          No matches for{" "}
          <span className="font-mono">
            {clauses.map((c) => `#${c.key}:${c.value}`).join(" ")}
          </span>
        </CommandEmpty>
      );
    }
    return null; // Generic "No results" handled by parent CommandList
  }

  return (
    <>
      {savedSearches.length > 0 && (
        <CommandGroup heading="Saved">
          {savedSearches.map((s) => (
            <CommandItem
              key={`saved-${s.id}`}
              value={`saved ${s.label} ${s.filterInput}`}
              onSelect={() => onApplySavedSearch?.(s.filterInput)}
            >
              <Bookmark className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{s.label}</span>
              <span className="ml-auto shrink-0 text-xs font-mono text-muted-foreground">
                {s.filterInput}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      )}
      {visiblePins.length > 0 && (
        <CommandGroup heading="Pinned">
          {visiblePins.map((p) => {
            const Icon = ENTITY_ICONS[p.type] ?? FileText;
            return (
              <CommandItem
                key={`pin-${p.id}`}
                value={`pinned ${p.type} ${p.label} ${p.description ?? ""} ${p.status ?? ""}`}
                onSelect={() =>
                  onSelect({
                    type: "mention",
                    id: p.type,
                    label: p.label,
                    entityType: p.type,
                    entityId: p.id,
                  })
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="flex-1 truncate">{p.label}</span>
                  {p.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {p.description}
                    </span>
                  )}
                </div>
                {p.status && (
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {p.status}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`Unpin ${p.label}`}
                  className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  // Stop cmdk's parent row selection on pin-button click —
                  // otherwise the unpin fires AND the item is inserted.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnpin(p.id);
                  }}
                >
                  <PinOff className="h-3.5 w-3.5" />
                </button>
              </CommandItem>
            );
          })}
        </CommandGroup>
      )}
      {entityTypes.map((type) => {
        const Icon = ENTITY_ICONS[type] ?? FileText;
        const groupLabel = ENTITY_LABELS[type] ?? type;
        const isFile = type === "file";
        return (
          <CommandGroup key={type} heading={groupLabel}>
            {grouped[type].map((entity) => {
              const pinnable = entity.entityType !== "file";
              return (
                <CommandItem
                  key={`${entity.entityType}-${entity.entityId}`}
                  value={`${entity.entityType} ${entity.label} ${entity.description ?? ""} ${entity.status ?? ""}`}
                  onSelect={() =>
                    onSelect({
                      type: "mention",
                      id: entity.entityType,
                      label: entity.label,
                      entityType: entity.entityType,
                      entityId: entity.entityId,
                    })
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <span
                      className={
                        isFile
                          ? "flex-1 truncate font-mono text-xs"
                          : "flex-1 truncate"
                      }
                    >
                      {entity.label}
                    </span>
                    {entity.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {entity.description}
                      </span>
                    )}
                  </div>
                  {entity.status && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {entity.status}
                    </span>
                  )}
                  {pinnable && (
                    <button
                      type="button"
                      aria-label={`Pin ${entity.label}`}
                      className="ml-2 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 data-[selected=true]:opacity-100 hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring transition-opacity"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPin({
                          id: entity.entityId,
                          type: entity.entityType,
                          label: entity.label,
                          description: entity.description,
                          status: entity.status,
                        });
                      }}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </button>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        );
      })}
    </>
  );
}

function SaveViewFooter({
  surface,
  clauses,
  filterInput,
  onSave,
}: {
  surface: SavedSearchSurface;
  clauses: FilterClause[];
  filterInput: string;
  onSave: (label: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");

  const defaultLabel = clauses.map((c) => `#${c.key}:${c.value}`).join(" ");

  if (!renaming) {
    return (
      <div className="border-t px-2 py-1.5">
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-1 py-0.5 rounded transition-colors"
          onClick={() => setRenaming(true)}
        >
          <Bookmark className="h-3.5 w-3.5" />
          Save this view ({surface})
        </button>
      </div>
    );
  }

  return (
    <form
      className="border-t px-2 py-1.5 flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft.trim());
        setRenaming(false);
        setDraft("");
      }}
    >
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={defaultLabel}
        className="flex-1 h-7 px-2 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button
        type="submit"
        className="h-7 px-2 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Save
      </button>
      <button
        type="button"
        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => {
          setRenaming(false);
          setDraft("");
        }}
      >
        Cancel
      </button>
    </form>
  );
}
