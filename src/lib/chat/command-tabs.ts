import type { ToolCatalogEntry, ToolGroup } from "./tool-catalog";

export const COMMAND_TAB_IDS = ["actions", "skills", "tools", "entities"] as const;
export type CommandTabId = (typeof COMMAND_TAB_IDS)[number];

export interface CommandTab {
  id: CommandTabId;
  label: string;
  shortcut: string; // ⌘1..⌘4
}

export const COMMAND_TABS: CommandTab[] = [
  { id: "actions", label: "Actions", shortcut: "⌘1" },
  { id: "skills", label: "Skills", shortcut: "⌘2" },
  { id: "tools", label: "Tools", shortcut: "⌘3" },
  { id: "entities", label: "Entities", shortcut: "⌘4" },
];

export const DEFAULT_COMMAND_TAB: CommandTabId = "actions";

export const GROUP_TO_TAB = {
  // ainative actions / session primitives
  Session: "actions",
  Tasks: "actions",
  Projects: "actions",
  Workflows: "actions",
  Schedules: "actions",
  Documents: "actions",
  Tables: "actions",
  Notifications: "actions",
  Agents: "actions",
  Usage: "actions",
  Settings: "actions",
  Chat: "actions",
  // Skills
  Skills: "skills",
  // Tools (filesystem / system / utility)
  Browser: "tools",
  Utility: "tools",
} satisfies Record<ToolGroup, CommandTabId>;

export function isCommandTabId(value: string): value is CommandTabId {
  return (COMMAND_TAB_IDS as readonly string[]).includes(value);
}

export interface PartitionedCatalog {
  actions: ToolCatalogEntry[];
  skills: ToolCatalogEntry[];
  tools: ToolCatalogEntry[];
  entities: ToolCatalogEntry[];
}

export function partitionCatalogByTab(
  catalog: ToolCatalogEntry[]
): PartitionedCatalog {
  const out: PartitionedCatalog = { actions: [], skills: [], tools: [], entities: [] };
  for (const entry of catalog) {
    out[GROUP_TO_TAB[entry.group]].push(entry);
  }
  return out;
}
