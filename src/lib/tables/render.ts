import type { ColumnDef } from "@/lib/tables/types";

export type TableDisplayRole =
  | "title"
  | "description"
  | "image"
  | "category"
  | "metric"
  | "date"
  | "link"
  | "boolean"
  | "meta";

export interface ResolvedRenderColumn {
  column: ColumnDef;
  role: TableDisplayRole;
}

const DESCRIPTION_NAME = /(^|_)(description|summary|abstract|notes?|details?|body)($|_)/i;
const IMAGE_NAME = /(^|_)(image|image_url|thumbnail|photo|avatar|cover|logo)($|_)/i;
const CATEGORY_NAME = /(^|_)(category|status|stage|phase|type|channel|segment)($|_)/i;
const TITLE_NAME = /(^|_)(title|name|subject|headline|label)($|_)/i;

function fallbackRole(column: ColumnDef): TableDisplayRole {
  const name = `${column.name}_${column.displayName}`;
  if (column.dataType === "url" && IMAGE_NAME.test(name)) return "image";
  if (column.dataType === "select" || CATEGORY_NAME.test(name)) return "category";
  if (column.dataType === "number") return "metric";
  if (column.dataType === "date") return "date";
  if (column.dataType === "url" || column.dataType === "email") return "link";
  if (column.dataType === "boolean") return "boolean";
  if (column.dataType === "text" && DESCRIPTION_NAME.test(name)) return "description";
  if (column.dataType === "text" && TITLE_NAME.test(name)) return "title";
  return "meta";
}

export function resolveRenderColumns(
  columns: ColumnDef[]
): ResolvedRenderColumn[] {
  const resolved = columns
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((column) => ({
      column,
      role: column.config?.displayRole ?? fallbackRole(column),
    }));

  for (const role of ["title", "description", "image"] as const) {
    const candidates = resolved.filter((entry) => entry.role === role);
    const winner =
      candidates.find((entry) => entry.column.config?.displayRole === role) ??
      candidates[0];
    for (const candidate of candidates) {
      if (candidate !== winner) {
        candidate.role = role === "image" ? "link" : "meta";
      }
    }
  }

  if (!resolved.some((entry) => entry.role === "title")) {
    const candidate =
      resolved.find(
        ({ column, role }) =>
          column.dataType === "text" && role !== "description"
      ) ?? resolved.find(({ role }) => role === "meta");
    if (candidate) candidate.role = "title";
  }

  return resolved;
}

export function safeThumbnailUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    if (value.startsWith("data:image/")) return value;
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === "https:") return url.toString();
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function categoryTone(value: unknown): number {
  const text = String(value ?? "");
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return hash % 6;
}

export interface NumericPresentation {
  label: "Low" | "Mid" | "High" | "No range";
  normalized: number | null;
  direction: "Higher" | "Lower" | "Neutral";
}

export function numericPresentation(
  value: unknown,
  values: unknown[],
  config?: ColumnDef["config"]
): NumericPresentation {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return { label: "No range", normalized: null, direction: "Neutral" };
  }
  const finiteValues = values
    .map((candidate) =>
      typeof candidate === "number" ? candidate : Number(candidate)
    )
    .filter(Number.isFinite);
  const min = config?.numberDomain?.min ?? Math.min(...finiteValues);
  const max = config?.numberDomain?.max ?? Math.max(...finiteValues);
  const direction =
    config?.numberPolarity === "higher"
      ? "Higher"
      : config?.numberPolarity === "lower"
        ? "Lower"
        : "Neutral";
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    return { label: "No range", normalized: null, direction };
  }
  const normalized = Math.min(1, Math.max(0, (number - min) / (max - min)));
  return {
    label: normalized < 1 / 3 ? "Low" : normalized < 2 / 3 ? "Mid" : "High",
    normalized,
    direction,
  };
}
