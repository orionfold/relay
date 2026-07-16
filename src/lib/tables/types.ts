import type {
  UserTableRow,
  UserTableColumnRow,
  UserTableRowRow,
  UserTableTemplateRow,
} from "@/lib/db/schema";
import type { ColumnDataType } from "@/lib/constants/table-status";

// ── Column Definition (stored in column_schema JSON) ─────────────────

export interface ColumnDef {
  name: string;
  displayName: string;
  dataType: ColumnDataType;
  position: number;
  required?: boolean;
  defaultValue?: string | null;
  config?: ColumnConfig | null;
}

/** Type-specific column configuration */
export interface ColumnConfig {
  /** Select column: available options */
  options?: string[];
  /** Computed column: formula expression */
  formula?: string;
  /** Computed column: formula type */
  formulaType?: "arithmetic" | "text_concat" | "date_diff" | "conditional" | "aggregate";
  /** Computed column: expected result type */
  resultType?: ColumnDataType;
  /** Computed column: column names this formula depends on */
  dependencies?: string[];
  /** Relation column: target table ID */
  targetTableId?: string;
  /** Relation column: display column name in target table */
  displayColumn?: string;
  /** Optional semantic role used by the shared Render view. */
  displayRole?:
    | "title"
    | "description"
    | "image"
    | "category"
    | "metric"
    | "date"
    | "link"
    | "boolean"
    | "meta";
  /** Number interpretation for labels only; color never implies good/bad. */
  numberPolarity?: "higher" | "lower" | "neutral";
  /** Optional stable number domain for cross-page intensity comparison. */
  numberDomain?: { min: number; max: number };
}

// ── Filter & Sort Specs ──────────────────────────────────────────────

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "starts_with"
  | "in"
  | "is_empty"
  | "is_not_empty";

export interface FilterSpec {
  column: string;
  operator: FilterOperator;
  value?: string | number | boolean | string[];
}

export interface SortSpec {
  column: string;
  direction: "asc" | "desc";
}

// ── Query Options ────────────────────────────────────────────────────

export interface RowQueryOptions {
  filters?: FilterSpec[];
  sorts?: SortSpec[];
  limit?: number;
  offset?: number;
}

// ── Enriched Types (with joins) ──────────────────────────────────────

export interface TableWithRelations extends UserTableRow {
  projectName?: string | null;
  columnCount: number;
  columns?: UserTableColumnRow[];
}

export interface RowWithMeta extends UserTableRowRow {
  parsedData: Record<string, unknown>;
}

// ── Input Types ──────────────────────────────────────────────────────

export interface CreateTableInput {
  name: string;
  description?: string | null;
  projectId?: string | null;
  columns?: ColumnDef[];
  source?: "manual" | "imported" | "agent" | "template";
  templateId?: string | null;
}

export interface UpdateTableInput {
  name?: string;
  description?: string | null;
  projectId?: string | null;
}

export interface AddColumnInput {
  name: string;
  displayName: string;
  dataType: ColumnDataType;
  required?: boolean;
  defaultValue?: string | null;
  config?: ColumnConfig | null;
}

export interface UpdateColumnInput {
  displayName?: string;
  dataType?: ColumnDataType;
  required?: boolean;
  defaultValue?: string | null;
  config?: ColumnConfig | null;
}

export interface AddRowInput {
  data: Record<string, unknown>;
  createdBy?: string;
}

export interface UpdateRowInput {
  data: Record<string, unknown>;
}

// ── Template Types ───────────────────────────────────────────────────

export interface TemplateWithPreview extends UserTableTemplateRow {
  parsedColumns: ColumnDef[];
  parsedSampleData: Record<string, unknown>[];
}

export interface CloneFromTemplateInput {
  templateId: string;
  name: string;
  projectId?: string | null;
  includeSampleData?: boolean;
}
