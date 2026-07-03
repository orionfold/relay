import {
  ListTodo,
  FolderKanban,
  GitBranch,
  FileText,
  Bell,
  Bot,
  Wallet,
  Settings,
  MessageSquare,
  Clock,
  Globe,
  Sun,
  Sparkles,
  Table2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

export type ToolGroup =
  | "Tasks"
  | "Projects"
  | "Workflows"
  | "Schedules"
  | "Documents"
  | "Tables"
  | "Notifications"
  | "Profiles"
  | "Skills"
  | "Usage"
  | "Settings"
  | "Chat"
  | "Browser"
  | "Utility"
  | "Session";

export interface ToolCatalogEntry {
  /** MCP tool name, e.g. "list_tasks" */
  name: string;
  /** Human-readable description */
  description: string;
  /** Grouping category */
  group: ToolGroup;
  /** Shortened parameter hint, e.g. "status, projectId" */
  paramHint?: string;
  /** Client-side action that bypasses MCP */
  behavior?: "execute_immediately";
}

// ── Group → Icon mapping ─────────────────────────────────────────────────

export const TOOL_GROUP_ICONS: Record<ToolGroup, LucideIcon> = {
  Session: Zap,
  Tasks: ListTodo,
  Projects: FolderKanban,
  Workflows: GitBranch,
  Schedules: Clock,
  Documents: FileText,
  Tables: Table2,
  Notifications: Bell,
  Profiles: Bot,
  Skills: Sparkles,
  Usage: Wallet,
  Settings: Settings,
  Chat: MessageSquare,
  Browser: Globe,
  Utility: Sun,
};

/** Display order for groups in the popover */
export const TOOL_GROUP_ORDER: ToolGroup[] = [
  "Session",
  "Tasks",
  "Projects",
  "Workflows",
  "Documents",
  "Tables",
  "Schedules",
  "Profiles",
  "Skills",
  "Browser",
  "Notifications",
  "Chat",
  "Usage",
  "Settings",
  "Utility",
];

// ── Static tool registry ─────────────────────────────────────────────────
// Mirrors names/descriptions from src/lib/chat/tools/*.ts
// Keep in sync when adding or renaming MCP tools.

const AINATIVE_TOOLS: ToolCatalogEntry[] = [
  // ── Tasks ──
  { name: "list_tasks", description: "List tasks, filter by project or status", group: "Tasks", paramHint: "projectId, status" },
  { name: "get_task", description: "Get full details for a task", group: "Tasks", paramHint: "taskId" },
  { name: "create_task", description: "Create a new task", group: "Tasks", paramHint: "title, description, priority" },
  { name: "update_task", description: "Update a task's status, title, or priority", group: "Tasks", paramHint: "taskId, status, priority" },
  { name: "execute_task", description: "Queue and run a task with an AI agent", group: "Tasks", paramHint: "taskId" },
  { name: "cancel_task", description: "Cancel a running task", group: "Tasks", paramHint: "taskId" },

  // ── Projects ──
  { name: "list_projects", description: "List all projects with task counts", group: "Projects", paramHint: "status" },
  { name: "create_project", description: "Create a new project", group: "Projects", paramHint: "name, description" },

  // ── Workflows ──
  { name: "list_workflows", description: "List workflows, filter by project or status", group: "Workflows", paramHint: "projectId, status" },
  { name: "get_workflow", description: "Get workflow details and step info", group: "Workflows", paramHint: "workflowId" },
  { name: "create_workflow", description: "Create a workflow with steps", group: "Workflows", paramHint: "name, definition" },
  { name: "update_workflow", description: "Update a draft workflow", group: "Workflows", paramHint: "workflowId, name" },
  { name: "execute_workflow", description: "Start executing a workflow", group: "Workflows", paramHint: "workflowId" },
  { name: "delete_workflow", description: "Delete a workflow", group: "Workflows", paramHint: "workflowId" },
  { name: "get_workflow_status", description: "Get workflow execution progress", group: "Workflows", paramHint: "workflowId" },
  { name: "list_blueprints", description: "List available workflow blueprints", group: "Workflows", paramHint: "domain, search" },
  { name: "get_blueprint", description: "Get blueprint details and variables", group: "Workflows", paramHint: "blueprintId" },
  { name: "instantiate_blueprint", description: "Create a workflow from a blueprint", group: "Workflows", paramHint: "blueprintId, variables" },
  { name: "create_blueprint", description: "Create a custom workflow blueprint", group: "Workflows", paramHint: "yaml" },
  { name: "delete_blueprint", description: "Delete a custom blueprint", group: "Workflows", paramHint: "blueprintId" },

  // ── Schedules ──
  { name: "list_schedules", description: "List scheduled prompt loops", group: "Schedules", paramHint: "status" },
  { name: "get_schedule", description: "Get schedule details", group: "Schedules", paramHint: "scheduleId" },
  { name: "create_schedule", description: "Create a recurring scheduled task", group: "Schedules", paramHint: "name, prompt, interval" },
  { name: "update_schedule", description: "Update or pause/resume a schedule", group: "Schedules", paramHint: "scheduleId, status" },
  { name: "delete_schedule", description: "Delete a schedule", group: "Schedules", paramHint: "scheduleId" },

  // ── Documents ──
  { name: "list_documents", description: "List documents, filter by project or status", group: "Documents", paramHint: "projectId, status" },
  { name: "get_document", description: "Get document metadata", group: "Documents", paramHint: "documentId" },
  { name: "read_document_content", description: "Read full text content of a document", group: "Documents", paramHint: "documentId" },
  { name: "upload_document", description: "Upload a file as a document", group: "Documents", paramHint: "file_path" },
  { name: "update_document", description: "Update document metadata", group: "Documents", paramHint: "documentId, metadata" },
  { name: "delete_document", description: "Delete a document", group: "Documents", paramHint: "documentId" },

  // ── Notifications ──
  { name: "list_notifications", description: "List pending approval requests", group: "Notifications", paramHint: "pendingOnly, limit" },
  { name: "respond_notification", description: "Approve or deny a pending request", group: "Notifications", paramHint: "notificationId, behavior" },
  { name: "mark_notifications_read", description: "Mark all notifications as read", group: "Notifications" },

  // ── Profiles ──
  { name: "list_profiles", description: "List available agent profiles", group: "Profiles" },
  { name: "get_profile", description: "Get agent profile configuration", group: "Profiles", paramHint: "profileId" },
  { name: "create_profile", description: "Create a new agent profile", group: "Profiles", paramHint: "config, skillMd" },
  { name: "update_profile", description: "Update a custom agent profile", group: "Profiles", paramHint: "profileId, config, skillMd" },
  { name: "delete_profile", description: "Delete a custom agent profile", group: "Profiles", paramHint: "profileId" },

  // ── Usage ──
  { name: "get_usage_summary", description: "Get spending and token usage stats", group: "Usage", paramHint: "days" },

  // ── Settings ──
  { name: "get_settings", description: "Get current Relay settings", group: "Settings", paramHint: "key" },
  { name: "set_settings", description: "Update a Relay setting (approval required)", group: "Settings", paramHint: "key, value" },

  // ── Skills ──
  { name: "list_skills", description: "List all discoverable skills (user + project scopes)", group: "Skills" },
  { name: "get_skill", description: "Get full SKILL.md content + metadata for one skill", group: "Skills", paramHint: "id" },
  { name: "activate_skill", description: "Bind a skill to a conversation — SKILL.md is injected into every turn's system prompt. Pass mode='add' to compose (runtime-gated).", group: "Skills", paramHint: "conversationId, skillId, mode?" },
  { name: "deactivate_skill", description: "Clear the active skill from a conversation", group: "Skills", paramHint: "conversationId" },

  // ── Tables ──
  { name: "list_tables", description: "List tables, filter by project or source", group: "Tables", paramHint: "projectId, source" },
  { name: "get_table_schema", description: "Get column definitions for a table", group: "Tables", paramHint: "tableId" },
  { name: "query_table", description: "Query rows with filters and sorting", group: "Tables", paramHint: "tableId, filters, sorts, limit" },
  { name: "search_table", description: "Full-text search across table text columns", group: "Tables", paramHint: "tableId, query, limit" },
  { name: "aggregate_table", description: "Run aggregate operations (sum, avg, count, min, max)", group: "Tables", paramHint: "tableId, column, operation" },
  { name: "add_rows", description: "Add one or more rows to a table", group: "Tables", paramHint: "tableId, rows" },
  { name: "update_row", description: "Update fields in a table row", group: "Tables", paramHint: "rowId, data" },
  { name: "delete_rows", description: "Delete rows from a table", group: "Tables", paramHint: "rowIds" },
  { name: "create_table", description: "Create a new table with column schema", group: "Tables", paramHint: "name, columns" },
  { name: "import_document_as_table", description: "Import CSV/XLSX document into a table", group: "Tables", paramHint: "tableId, documentId" },
  { name: "list_table_templates", description: "List available table templates", group: "Tables", paramHint: "category" },
  { name: "create_table_from_template", description: "Create a table from a template", group: "Tables", paramHint: "templateId, name, includeSampleData" },
  { name: "create_table_from_description", description: "Create a table from a natural language description", group: "Tables", paramHint: "description, name, columns" },
  { name: "export_table", description: "Export table data as CSV, JSON, or XLSX", group: "Tables", paramHint: "tableId, format" },
  { name: "add_column", description: "Add a column to a table", group: "Tables", paramHint: "tableId, name, dataType" },
  { name: "update_column", description: "Update a column's name or type", group: "Tables", paramHint: "columnId, displayName, dataType" },
  { name: "delete_column", description: "Delete a column from a table", group: "Tables", paramHint: "columnId" },
  { name: "reorder_columns", description: "Reorder columns in a table", group: "Tables", paramHint: "tableId, columnIds" },
  { name: "update_table", description: "Update a table's name or description", group: "Tables", paramHint: "tableId, name, description" },
  { name: "delete_table", description: "Delete a table and all its data", group: "Tables", paramHint: "tableId" },
  { name: "list_charts", description: "List saved charts for a table", group: "Tables", paramHint: "tableId" },
  { name: "create_chart", description: "Create a bar/line/pie/scatter chart", group: "Tables", paramHint: "tableId, type, title, xColumn, yColumn" },
  { name: "list_triggers", description: "List triggers for a table", group: "Tables", paramHint: "tableId" },
  { name: "create_trigger", description: "Create a trigger on row changes", group: "Tables", paramHint: "tableId, triggerEvent, actionType" },
  { name: "update_trigger", description: "Update trigger status or config", group: "Tables", paramHint: "tableId, triggerId, status" },
  { name: "delete_trigger", description: "Delete a trigger", group: "Tables", paramHint: "tableId, triggerId" },
  { name: "get_table_history", description: "Get row change history for a table", group: "Tables", paramHint: "tableId, limit" },
  { name: "save_as_template", description: "Save a table as a reusable template", group: "Tables", paramHint: "tableId, name, category" },
  { name: "enrich_table", description: "Bulk-enrich rows by running an agent task per row, writing results to a target column", group: "Tables", paramHint: "tableId, prompt, targetColumn, filter" },

  // ── Chat History ──
  { name: "list_conversations", description: "List recent chat conversations", group: "Chat", paramHint: "search, limit" },
  { name: "get_conversation_messages", description: "Get messages from a past conversation", group: "Chat", paramHint: "conversationId, limit" },
  { name: "search_messages", description: "Search across all conversations", group: "Chat", paramHint: "query" },

];

const BROWSER_TOOLS: ToolCatalogEntry[] = [
  { name: "take_screenshot", description: "Capture a screenshot of the page", group: "Browser" },
  { name: "navigate_page", description: "Navigate to a URL", group: "Browser", paramHint: "url" },
  { name: "click", description: "Click an element on the page", group: "Browser", paramHint: "selector" },
  { name: "get_page_text", description: "Extract text content from the page", group: "Browser" },
  { name: "fill", description: "Fill in a form field", group: "Browser", paramHint: "selector, value" },
  { name: "take_snapshot", description: "Take an accessibility snapshot", group: "Browser" },
];

const SESSION_ENTRIES: ToolCatalogEntry[] = [
  { name: "clear", description: "Start a new conversation", group: "Session", behavior: "execute_immediately" },
  { name: "compact", description: "Summarize and compact conversation history", group: "Session", behavior: "execute_immediately" },
  { name: "export", description: "Save current conversation as a document", group: "Session", behavior: "execute_immediately" },
  { name: "help", description: "Show chat shortcuts and commands", group: "Session", behavior: "execute_immediately" },
  { name: "settings", description: "Open Relay settings", group: "Session", behavior: "execute_immediately" },
  { name: "new-task", description: "Create a new task", group: "Session", paramHint: "title" },
  { name: "new-workflow", description: "Create a new workflow", group: "Session", paramHint: "name" },
  { name: "new-schedule", description: "Create a new schedule", group: "Session", paramHint: "name, interval" },
  { name: "new-from-template", description: "Start a conversation from a workflow blueprint", group: "Session", behavior: "execute_immediately" },
];

const UTILITY_ENTRIES: ToolCatalogEntry[] = [
  { name: "toggle_theme", description: "Switch dark/light mode", group: "Utility", behavior: "execute_immediately" },
  { name: "mark_all_read", description: "Mark all notifications as read", group: "Utility", behavior: "execute_immediately" },
];

// ── Public API ───────────────────────────────────────────────────────────

let cachedCatalog: ToolCatalogEntry[] | null = null;
let cachedWithBrowser: ToolCatalogEntry[] | null = null;

export function getToolCatalog(opts?: { includeBrowser?: boolean }): ToolCatalogEntry[] {
  const withBrowser = opts?.includeBrowser ?? false;

  if (withBrowser) {
    if (!cachedWithBrowser) {
      cachedWithBrowser = [...SESSION_ENTRIES, ...AINATIVE_TOOLS, ...BROWSER_TOOLS, ...UTILITY_ENTRIES];
    }
    return cachedWithBrowser;
  }

  if (!cachedCatalog) {
    cachedCatalog = [...SESSION_ENTRIES, ...AINATIVE_TOOLS, ...UTILITY_ENTRIES];
  }
  return cachedCatalog;
}

/**
 * Get the tool catalog with dynamic project skills appended.
 * NOT cached at module level because it depends on the active project.
 */
export function getToolCatalogWithSkills(opts?: {
  includeBrowser?: boolean;
  projectProfiles?: Array<{ id: string; name: string; description: string }>;
}): ToolCatalogEntry[] {
  const base = getToolCatalog(opts);
  if (!opts?.projectProfiles?.length) return base;

  const skillEntries: ToolCatalogEntry[] = opts.projectProfiles.map((p) => ({
    name: p.id,
    description: p.description,
    group: "Skills" as ToolGroup,
  }));

  return [...base, ...skillEntries];
}

/** Group catalog entries by their ToolGroup */
export function groupToolCatalog(entries: ToolCatalogEntry[]): Record<string, ToolCatalogEntry[]> {
  const groups: Record<string, ToolCatalogEntry[]> = {};
  for (const entry of entries) {
    if (!groups[entry.group]) groups[entry.group] = [];
    groups[entry.group].push(entry);
  }
  return groups;
}
