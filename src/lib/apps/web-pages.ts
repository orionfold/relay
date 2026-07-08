import type { AppDetail } from "@/lib/apps/registry";
import { ensureAppProject } from "@/lib/apps/compose-integration";
import {
  addColumn,
  addRows,
  createTable,
  getColumns,
  getTable,
  deleteRows,
  listRows,
  listTables,
  updateRow,
} from "@/lib/data/tables";
import type { UserTableRowRow } from "@/lib/db/schema";
import type { ColumnDef } from "@/lib/tables/types";

export const DEFAULT_WEB_PAGE_SLUG = "home";

const WEB_PAGES_TABLE_NAME = "Web Pages";
const WEB_SECTIONS_TABLE_NAME = "Web Sections";

const WEB_PAGE_COLUMNS: ColumnDef[] = [
  { name: "slug", displayName: "Slug", dataType: "text", position: 0, required: true },
  { name: "title", displayName: "Title", dataType: "text", position: 1, required: true },
  { name: "description", displayName: "Description", dataType: "text", position: 2 },
  { name: "status", displayName: "Status", dataType: "text", position: 3 },
  { name: "sortOrder", displayName: "Sort Order", dataType: "text", position: 4 },
  { name: "notes", displayName: "Notes", dataType: "text", position: 5 },
];

export interface ParsedTableRow {
  id: string;
  tableId: string;
  data: Record<string, unknown>;
  updatedAt: Date;
}

export interface WebPageRecord {
  rowId: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  sortOrder: number;
  updatedAt: Date;
}

export interface WebPageRegistry {
  pagesTableId: string;
  sectionsTableId: string;
  pages: WebPageRecord[];
  sections: ParsedTableRow[];
}

export type WebPageRegistryErrorCode = "WEB_PAGE_NOT_FOUND" | "WEB_PAGE_LAST_PAGE";

export class WebPageRegistryError extends Error {
  readonly code: WebPageRegistryErrorCode;

  constructor(code: WebPageRegistryErrorCode, message: string) {
    super(message);
    this.name = "WebPageRegistryError";
    this.code = code;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "page"
  );
}

function parseRow(row: UserTableRowRow): ParsedTableRow | null {
  try {
    const data = JSON.parse(row.data) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return {
      id: row.id,
      tableId: row.tableId,
      data: data as Record<string, unknown>,
      updatedAt: row.updatedAt,
    };
  } catch {
    return null;
  }
}

function parsePage(row: ParsedTableRow): WebPageRecord | null {
  const slug = slugify(stringValue(row.data.slug));
  if (!slug) return null;
  return {
    rowId: row.id,
    slug,
    title: stringValue(row.data.title) || titleFromSlug(slug),
    description: stringValue(row.data.description),
    status: stringValue(row.data.status) || "draft",
    sortOrder: numberValue(row.data.sortOrder),
    updatedAt: row.updatedAt,
  };
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isPagesManifestTable(table: { columns?: string[] | undefined }): boolean {
  const columns = new Set(table.columns ?? []);
  return columns.has("slug") && columns.has("title") && columns.has("sortOrder");
}

async function resolvePagesTableId(app: AppDetail): Promise<string> {
  const manifestTable = app.manifest.tables.find(isPagesManifestTable);
  if (manifestTable && (await getTable(manifestTable.id))) return manifestTable.id;

  await ensureAppProject(app.id);
  const existing = (await listTables({ projectId: app.id })).find(
    (table) => table.name === WEB_PAGES_TABLE_NAME
  );
  if (existing) return existing.id;

  const created = await createTable({
    name: WEB_PAGES_TABLE_NAME,
    projectId: app.id,
    source: "template",
    columns: WEB_PAGE_COLUMNS,
  });
  return created.id;
}

async function resolveSectionsTableId(app: AppDetail): Promise<string> {
  const generated = app.manifest.view?.bindings.generate?.table;
  if (generated) return generated;

  const existing = (await listTables({ projectId: app.id })).find(
    (table) => table.name === WEB_SECTIONS_TABLE_NAME
  );
  if (existing) return existing.id;
  throw new Error("Web Publisher sections table is missing");
}

async function ensureSectionPageSlugColumn(sectionsTableId: string): Promise<void> {
  const columns = await getColumns(sectionsTableId);
  if (columns.some((column) => column.name === "pageSlug")) return;
  await addColumn(sectionsTableId, {
    name: "pageSlug",
    displayName: "Page Slug",
    dataType: "text",
    defaultValue: DEFAULT_WEB_PAGE_SLUG,
  });
}

async function loadParsedRows(tableId: string): Promise<ParsedTableRow[]> {
  const rows = await listRows(tableId, { limit: 10_000 });
  return rows.flatMap((row) => {
    const parsed = parseRow(row);
    return parsed ? [parsed] : [];
  });
}

async function ensureDefaultPage(pagesTableId: string): Promise<void> {
  const pages = await loadParsedRows(pagesTableId);
  if (pages.some((row) => slugify(stringValue(row.data.slug)) === DEFAULT_WEB_PAGE_SLUG)) {
    return;
  }
  await addRows(pagesTableId, [
    {
      data: {
        slug: DEFAULT_WEB_PAGE_SLUG,
        title: "Home",
        description: "Default landing page",
        status: "draft",
        sortOrder: 1,
        notes: "Created automatically for existing Web Publisher sections.",
      },
      createdBy: "user",
    },
  ]);
}

async function backfillSectionPageSlugs(sections: ParsedTableRow[]): Promise<void> {
  await Promise.all(
    sections
      .filter((row) => !stringValue(row.data.pageSlug))
      .map((row) =>
        updateRow(row.id, {
          data: { pageSlug: DEFAULT_WEB_PAGE_SLUG },
        })
      )
  );
}

export async function ensureWebPageRegistry(app: AppDetail): Promise<WebPageRegistry> {
  const sectionsTableId = await resolveSectionsTableId(app);
  const pagesTableId = await resolvePagesTableId(app);
  await Promise.all([
    ensureSectionPageSlugColumn(sectionsTableId),
    ensureDefaultPage(pagesTableId),
  ]);

  const initialSections = await loadParsedRows(sectionsTableId);
  await backfillSectionPageSlugs(initialSections);

  const [pageRows, sections] = await Promise.all([
    loadParsedRows(pagesTableId),
    loadParsedRows(sectionsTableId),
  ]);
  const pages = pageRows
    .flatMap((row) => {
      const page = parsePage(row);
      return page ? [page] : [];
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  return {
    pagesTableId,
    sectionsTableId,
    pages,
    sections,
  };
}

export function sectionPageSlug(section: ParsedTableRow): string {
  return slugify(stringValue(section.data.pageSlug) || DEFAULT_WEB_PAGE_SLUG);
}

export function selectWebPage(
  registry: WebPageRegistry,
  requestedSlug: string | null | undefined
): WebPageRecord {
  const normalized = requestedSlug ? slugify(requestedSlug) : DEFAULT_WEB_PAGE_SLUG;
  return (
    registry.pages.find((page) => page.slug === normalized) ??
    registry.pages.find((page) => page.slug === DEFAULT_WEB_PAGE_SLUG) ??
    registry.pages[0] ?? {
      rowId: "",
      slug: DEFAULT_WEB_PAGE_SLUG,
      title: "Home",
      description: "Default landing page",
      status: "draft",
      sortOrder: 1,
      updatedAt: new Date(0),
    }
  );
}

export function filterSectionsForPage(
  sections: ParsedTableRow[],
  pageSlug: string
): ParsedTableRow[] {
  const normalized = slugify(pageSlug);
  return sections.filter((section) => sectionPageSlug(section) === normalized);
}

export async function createWebPublisherPage(app: AppDetail): Promise<WebPageRecord> {
  const registry = await ensureWebPageRegistry(app);
  const base = "untitled-page";
  const existing = new Set(registry.pages.map((page) => page.slug));
  let slug = base;
  let suffix = 2;
  while (existing.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }

  const sortOrder =
    registry.pages.reduce((max, page) => Math.max(max, page.sortOrder), 0) + 1;
  const { ids } = await addRows(registry.pagesTableId, [
    {
      data: {
        slug,
        title: "Untitled page",
        description: "",
        status: "draft",
        sortOrder,
        notes: "",
      },
      createdBy: "user",
    },
  ]);

  return {
    rowId: ids[0] ?? "",
    slug,
    title: "Untitled page",
    description: "",
    status: "draft",
    sortOrder,
    updatedAt: new Date(),
  };
}

export async function renameWebPublisherPage(
  app: AppDetail,
  pageSlug: string,
  title: string
): Promise<WebPageRecord> {
  const registry = await ensureWebPageRegistry(app);
  const target = registry.pages.find((page) => page.slug === slugify(pageSlug));
  if (!target) {
    throw new WebPageRegistryError(
      "WEB_PAGE_NOT_FOUND",
      `Web Publisher page not found: ${pageSlug}`
    );
  }

  const nextTitle = title.trim() || "Untitled page";
  await updateRow(target.rowId, { data: { title: nextTitle } });
  return {
    ...target,
    title: nextTitle,
    updatedAt: new Date(),
  };
}

export async function deleteWebPublisherPage(
  app: AppDetail,
  pageSlug: string
): Promise<{ deletedPageSlug: string; nextPageSlug: string; deletedSections: number }> {
  const registry = await ensureWebPageRegistry(app);
  const target = registry.pages.find((page) => page.slug === slugify(pageSlug));
  if (!target) {
    throw new WebPageRegistryError(
      "WEB_PAGE_NOT_FOUND",
      `Web Publisher page not found: ${pageSlug}`
    );
  }
  if (registry.pages.length <= 1) {
    throw new WebPageRegistryError(
      "WEB_PAGE_LAST_PAGE",
      "Web Publisher must keep at least one page"
    );
  }

  const nextPage =
    registry.pages.find((page) => page.slug !== target.slug && page.slug === DEFAULT_WEB_PAGE_SLUG) ??
    registry.pages.find((page) => page.slug !== target.slug)!;
  const sectionIds = filterSectionsForPage(registry.sections, target.slug).map(
    (section) => section.id
  );

  if (sectionIds.length > 0) {
    await deleteRows(sectionIds);
  }
  await deleteRows([target.rowId]);

  return {
    deletedPageSlug: target.slug,
    nextPageSlug: nextPage.slug,
    deletedSections: sectionIds.length,
  };
}
