import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { schedules } from "@/lib/db/schema";
import {
  AppManifestSchema,
  getApp,
  type AppManifest,
} from "@/lib/apps/registry";
import { getColumns, getTable, listRows } from "@/lib/data/tables";
import {
  getAinativeBlueprintsDir,
  getAinativeDataDir,
  getAinativeProfilesDir,
} from "@/lib/utils/ainative-paths";
import type { Artifact, ArtifactFile } from "@/lib/publishers/types";
import { PackManifestSchema, type PackMeta } from "./format";
import { TAXONOMY } from "./taxonomy";

export type AppPackExportErrorCode =
  | "APP_NOT_FOUND"
  | "PACK_EXPORT_FORBIDDEN"
  | "PACK_ID_INVALID"
  | "TABLE_NOT_FOUND"
  | "TABLE_NOT_OWNED"
  | "TAXONOMY_COLLISION"
  | "PROFILE_NOT_FOUND"
  | "BLUEPRINT_NOT_FOUND"
  | "BLUEPRINT_TRIGGER_INVALID"
  | "ARTIFACT_ID_INVALID"
  | "SCHEDULE_NOT_FOUND"
  | "SCHEDULE_BLUEPRINT_REQUIRED"
  | "ARTIFACT_PATH_INVALID"
  | "EXPORT_WRITE_FAILED";

export class AppPackExportError extends Error {
  readonly code: AppPackExportErrorCode;

  constructor(code: AppPackExportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AppPackExportError";
    this.code = code;
  }
}

export interface BuildAppPackOptions {
  author?: string;
  /** Privacy-sensitive. False by default; true includes at most 25 current rows per table. */
  includeSampleData?: boolean;
}

export interface WriteAppPackOptions extends BuildAppPackOptions {
  outputDir?: string;
}

export interface AppPackArtifact extends Artifact {
  packId: string;
  version: string;
  sampleRowsIncluded: number;
}

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;
const NAMESPACED_ARTIFACT_ID = /^[a-z0-9][a-z0-9-]*--[a-z0-9][a-z0-9-]*$/;
const SAMPLE_ROW_LIMIT = 25;
const ROW_DEFAULT = /^\{\{\s*row\.([a-zA-Z0-9_-]+)\s*\}\}$/;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "primitive";
}

/**
 * Community-owned logical ids are pack-namespaced by construction. Canonical,
 * cross-pack shared ids remain reserved to the taxonomy registry.
 */
function communityLogicalId(appId: string, label: string): string {
  return `${appId}--${slugify(label)}`;
}

function assertSafeArtifactPath(relPath: string): void {
  if (
    relPath.length === 0 ||
    path.isAbsolute(relPath) ||
    relPath.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new AppPackExportError(
      "ARTIFACT_PATH_INVALID",
      `Pack artifact path is unsafe: ${relPath}`
    );
  }
}

function addFile(files: ArtifactFile[], relPath: string, content: string | Buffer): void {
  const normalized = relPath.replaceAll(path.sep, "/");
  assertSafeArtifactPath(normalized);
  files.push({ path: normalized, content });
}

function addDirectory(files: ArtifactFile[], sourceDir: string, artifactDir: string): void {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = `${artifactDir}/${entry.name}`;
    if (entry.isDirectory()) addDirectory(files, source, target);
    else if (entry.isFile()) addFile(files, target, fs.readFileSync(source));
  }
}

function hashArtifact(files: ArtifactFile[]): string {
  const hash = crypto.createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function rewriteRefs(
  value: unknown,
  maps: { table: ReadonlyMap<string, string>; schedule: ReadonlyMap<string, string> }
): unknown {
  if (Array.isArray(value)) return value.map((entry) => rewriteRefs(entry, maps));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => {
        if ((key === "table" || key === "schedule") && typeof child === "string") {
          return [key, maps[key].get(child) ?? child];
        }
        return [key, rewriteRefs(child, maps)];
      })
    );
  }
  return value;
}

function uniqueLogicalId(
  preferred: string,
  used: Set<string>
): string {
  let candidate = preferred;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${preferred}-${suffix++}`;
  used.add(candidate);
  return candidate;
}

function yamlText(value: unknown): string {
  return yaml.dump(value, { noRefs: true, lineWidth: -1, sortKeys: false });
}

/**
 * Inverse of pack installation: read a running app and emit a portable,
 * data-only Relay Pack artifact. This function has no network access.
 */
export async function buildAppPackArtifact(
  appId: string,
  options: BuildAppPackOptions = {}
): Promise<AppPackArtifact> {
  if (!PACK_ID.test(appId)) {
    throw new AppPackExportError(
      "PACK_ID_INVALID",
      `App id "${appId}" cannot be exported. Pack ids must be kebab-case.`
    );
  }
  const app = getApp(appId);
  if (!app) {
    throw new AppPackExportError("APP_NOT_FOUND", `App not found: ${appId}`);
  }
  if (app.origin !== "user-created" || app.manifest.entitlement) {
    throw new AppPackExportError(
      "PACK_EXPORT_FORBIDDEN",
      "Installed pack content cannot be re-exported. Create a user-owned app shell and compose your own primitives first."
    );
  }

  const files: ArtifactFile[] = [];
  const tableRealToLogical = new Map<string, string>();
  const scheduleRealToLogical = new Map<string, string>();
  const usedTableIds = new Set<string>();
  const usedScheduleIds = new Set<string>();
  const exportedTables: AppManifest["tables"] = [];
  const tableColumnsByReal = new Map<string, Set<string>>();
  let sampleRowsIncluded = 0;

  for (const tableRef of app.manifest.tables) {
    const table = await getTable(tableRef.id);
    if (!table) {
      throw new AppPackExportError(
        "TABLE_NOT_FOUND",
        `App table not found: ${tableRef.id}`
      );
    }
    if (table.projectId !== appId) {
      throw new AppPackExportError(
        "TABLE_NOT_OWNED",
        `Table "${table.name}" belongs to project "${table.projectId ?? "none"}", not app "${appId}". Relay will not silently copy another project's data contract into this pack.`
      );
    }
    const logicalId = uniqueLogicalId(
      communityLogicalId(appId, table.name),
      usedTableIds
    );
    if (TAXONOMY.tables[logicalId]) {
      throw new AppPackExportError(
        "TAXONOMY_COLLISION",
        `Logical table id "${logicalId}" is reserved by ${TAXONOMY.tables[logicalId].owner}. Rename the table before exporting.`
      );
    }
    tableRealToLogical.set(tableRef.id, logicalId);
    const columns = await getColumns(tableRef.id);
    tableColumnsByReal.set(tableRef.id, new Set(columns.map((column) => column.name)));
    exportedTables.push({
      id: logicalId,
      name: table.name,
      ...(table.description ? { description: table.description } : {}),
      columns: columns.map((column) => column.name),
      columnDefinitions: columns.map((column) => ({
        name: column.name,
        displayName: column.displayName,
        dataType: column.dataType as
          | "text"
          | "number"
          | "date"
          | "boolean"
          | "select"
          | "url"
          | "email"
          | "relation"
          | "computed",
        required: column.required,
        defaultValue: column.defaultValue,
        config: column.config ? (JSON.parse(column.config) as Record<string, unknown>) : null,
      })),
    });

    if (options.includeSampleData) {
      const rows = await listRows(tableRef.id, { limit: SAMPLE_ROW_LIMIT });
      const data = rows.map((row) => {
        try {
          return JSON.parse(row.data) as Record<string, unknown>;
        } catch (cause) {
          throw new AppPackExportError(
            "EXPORT_WRITE_FAILED",
            `Table "${table.name}" contains a row that is not valid JSON.`,
            { cause }
          );
        }
      });
      if (data.length > 0) {
        addFile(
          files,
          `base/seed/tables/${logicalId}.json`,
          `${JSON.stringify(data, null, 2)}\n`
        );
        sampleRowsIncluded += data.length;
      }
    }
  }

  // Relation columns carry a table UUID in their config. Reverse it only
  // after every table map exists; a relation outside this app is not portable
  // and must fail visibly instead of shipping a dangling UUID.
  for (const table of exportedTables) {
    for (const column of table.columnDefinitions ?? []) {
      const target = column.config?.targetTableId;
      if (typeof target !== "string") continue;
      const logicalTarget = tableRealToLogical.get(target);
      if (!logicalTarget) {
        throw new AppPackExportError(
          "TABLE_NOT_OWNED",
          `Relation column "${column.displayName}" points to table ${target}, which is not owned by app "${appId}" and cannot be exported portably.`
        );
      }
      column.config = { ...column.config, targetTableId: logicalTarget };
    }
  }

  const exportedProfiles: AppManifest["profiles"] = [];
  for (const profileRef of app.manifest.profiles) {
    if (!NAMESPACED_ARTIFACT_ID.test(profileRef.id)) {
      throw new AppPackExportError(
        "ARTIFACT_ID_INVALID",
        `Profile id "${profileRef.id}" is not a safe namespaced pack id (<pack>--<profile>).`
      );
    }
    const sourceDir = path.join(getAinativeProfilesDir(), profileRef.id);
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new AppPackExportError(
        "PROFILE_NOT_FOUND",
        `Profile files not found for ${profileRef.id}`
      );
    }
    addDirectory(files, sourceDir, `base/profiles/${profileRef.id}`);
    exportedProfiles.push({
      ...profileRef,
      source: `$AINATIVE_DATA_DIR/profiles/${profileRef.id}/`,
    });
  }

  const blueprintIds = new Set(app.manifest.blueprints.map((blueprint) => blueprint.id));
  const blueprintDocuments = new Map<string, Record<string, unknown>>();
  const exportedBlueprints: AppManifest["blueprints"] = [];
  for (const blueprintRef of app.manifest.blueprints) {
    if (!NAMESPACED_ARTIFACT_ID.test(blueprintRef.id)) {
      throw new AppPackExportError(
        "ARTIFACT_ID_INVALID",
        `Blueprint id "${blueprintRef.id}" is not a safe namespaced pack id (<pack>--<blueprint>).`
      );
    }
    const sourceFile = path.join(getAinativeBlueprintsDir(), `${blueprintRef.id}.yaml`);
    if (!fs.existsSync(sourceFile) || !fs.statSync(sourceFile).isFile()) {
      throw new AppPackExportError(
        "BLUEPRINT_NOT_FOUND",
        `Blueprint file not found for ${blueprintRef.id}`
      );
    }
    const blueprintContent = fs.readFileSync(sourceFile);
    addFile(
      files,
      `base/blueprints/${blueprintRef.id}.yaml`,
      blueprintContent
    );
    const blueprintDocument = yaml.load(blueprintContent.toString("utf-8")) as
      | Record<string, unknown>
      | null;
    if (!blueprintDocument || typeof blueprintDocument !== "object") {
      throw new AppPackExportError(
        "BLUEPRINT_TRIGGER_INVALID",
        `Blueprint ${blueprintRef.id} is not a YAML object.`
      );
    }
    blueprintDocuments.set(blueprintRef.id, blueprintDocument);
    if (blueprintRef.trigger?.kind === "row-insert") {
      const columns = tableColumnsByReal.get(blueprintRef.trigger.table);
      if (!columns) {
        throw new AppPackExportError(
          "BLUEPRINT_TRIGGER_INVALID",
          `Blueprint ${blueprintRef.id} triggers on a table that this app does not own.`
        );
      }
      const variables = Array.isArray(blueprintDocument.variables)
        ? (blueprintDocument.variables as Array<Record<string, unknown>>)
        : [];
      for (const variable of variables) {
        if (variable.required !== true) continue;
        const id = String(variable.id);
        if (columns.has(id)) continue;
        const match =
          typeof variable.default === "string"
            ? ROW_DEFAULT.exec(variable.default)
            : null;
        if (match && columns.has(match[1])) continue;
        throw new AppPackExportError(
          "BLUEPRINT_TRIGGER_INVALID",
          `Blueprint ${blueprintRef.id} has required variable "${id}" that its row-insert trigger cannot fill. Add a {{row.<column>}} default or make it optional before exporting.`
        );
      }
    }
    const trigger = blueprintRef.trigger;
    exportedBlueprints.push({
      ...blueprintRef,
      source: `$AINATIVE_DATA_DIR/blueprints/${blueprintRef.id}.yaml`,
      ...(trigger?.table && tableRealToLogical.has(trigger.table)
        ? { trigger: { ...trigger, table: tableRealToLogical.get(trigger.table)! } }
        : {}),
    });
  }

  const exportedSchedules: AppManifest["schedules"] = [];
  for (const scheduleRef of app.manifest.schedules) {
    const schedule = db
      .select()
      .from(schedules)
      .where(eq(schedules.id, scheduleRef.id))
      .get();
    if (!schedule) {
      throw new AppPackExportError(
        "SCHEDULE_NOT_FOUND",
        `Schedule row not found: ${scheduleRef.id}`
      );
    }
    if (!scheduleRef.runs || !blueprintIds.has(scheduleRef.runs)) {
      throw new AppPackExportError(
        "SCHEDULE_BLUEPRINT_REQUIRED",
        `Schedule "${schedule.name}" is not bound to an app blueprint. Edit or recreate it with a blueprint before exporting; portable pack schedules must name the blueprint they run.`
      );
    }
    const scheduledBlueprint = blueprintDocuments.get(scheduleRef.runs);
    const variables = Array.isArray(scheduledBlueprint?.variables)
      ? (scheduledBlueprint.variables as Array<Record<string, unknown>>)
      : [];
    const missingDefault = variables.find(
      (variable) =>
        variable.required === true &&
        (variable.default === undefined || variable.default === null)
    );
    if (missingDefault) {
      throw new AppPackExportError(
        "SCHEDULE_BLUEPRINT_REQUIRED",
        `Schedule "${schedule.name}" runs blueprint ${scheduleRef.runs}, whose required variable "${String(missingDefault.id)}" has no default. Scheduled pack workflows cannot prompt a human.`
      );
    }
    const logicalId = uniqueLogicalId(
      communityLogicalId(appId, schedule.name),
      usedScheduleIds
    );
    if (TAXONOMY.schedules[logicalId]) {
      throw new AppPackExportError(
        "TAXONOMY_COLLISION",
        `Logical schedule id "${logicalId}" is reserved by ${TAXONOMY.schedules[logicalId].owner}. Rename the schedule before exporting.`
      );
    }
    scheduleRealToLogical.set(scheduleRef.id, logicalId);
    exportedSchedules.push({
      id: logicalId,
      name: schedule.name,
      cron: scheduleRef.cron ?? schedule.cronExpression,
      runs: scheduleRef.runs,
    });
  }

  const manifest = AppManifestSchema.parse({
    ...app.manifest,
    id: appId,
    version: app.manifest.version ?? "0.1.0",
    author: options.author ?? app.manifest.author,
    entitlement: undefined,
    // Origin describes ownership on this Relay instance, not portable Pack
    // provenance. The receiving installer stamps `installed-pack` itself.
    origin: undefined,
    tables: exportedTables,
    profiles: exportedProfiles,
    blueprints: exportedBlueprints,
    schedules: exportedSchedules,
    ...(app.manifest.view
      ? {
          view: rewriteRefs(app.manifest.view, {
            table: tableRealToLogical,
            schedule: scheduleRealToLogical,
          }),
        }
      : {}),
  });

  const meta: PackMeta = PackManifestSchema.parse({
    id: appId,
    version: manifest.version ?? "0.1.0",
    name: manifest.name,
    author: options.author ?? manifest.author ?? "Relay community",
    description: manifest.description,
    relayCore: ">=0.36.0",
    customers: [],
  });

  addFile(files, "pack.yaml", yamlText(meta));
  addFile(files, "base/manifest.yaml", yamlText(manifest));
  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    entryPoint: "pack.yaml",
    hash: hashArtifact(files),
    packId: meta.id,
    version: meta.version,
    sampleRowsIncluded,
  };
}

function writeArtifactDirectory(artifact: Artifact, outputDir: string): void {
  const destination = path.resolve(outputDir);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const stage = fs.mkdtempSync(path.join(parent, `.${path.basename(destination)}.stage-`));
  const backup = `${destination}.backup-${crypto.randomUUID()}`;
  let movedExisting = false;
  try {
    for (const file of artifact.files) {
      assertSafeArtifactPath(file.path);
      const target = path.join(stage, ...file.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content);
    }
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, backup);
      movedExisting = true;
    }
    fs.renameSync(stage, destination);
    if (movedExisting) fs.rmSync(backup, { recursive: true, force: true });
  } catch (cause) {
    fs.rmSync(stage, { recursive: true, force: true });
    if (movedExisting && !fs.existsSync(destination) && fs.existsSync(backup)) {
      fs.renameSync(backup, destination);
    }
    throw new AppPackExportError(
      "EXPORT_WRITE_FAILED",
      `Could not write pack export to ${destination}`,
      { cause }
    );
  }
}

export async function exportAppPackToDirectory(
  appId: string,
  options: WriteAppPackOptions = {}
): Promise<{ artifact: AppPackArtifact; outputDir: string }> {
  const artifact = await buildAppPackArtifact(appId, options);
  const outputDir = path.resolve(
    options.outputDir ?? path.join(getAinativeDataDir(), "exports", appId)
  );
  writeArtifactDirectory(artifact, outputDir);
  return { artifact, outputDir };
}
