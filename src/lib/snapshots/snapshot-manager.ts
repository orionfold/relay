/**
 * Core snapshot manager — create, list, delete, and restore full-state snapshots.
 *
 * A snapshot includes:
 *   1. Atomic SQLite backup via .backup() API (WAL-safe)
 *   2. Tarball of all ~/.ainative/ file directories (uploads, screenshots, outputs, etc.)
 *   3. manifest.json with metadata
 */

import { db, sqlite } from "@/lib/db";
import { snapshots } from "@/lib/db/schema";
import type { SnapshotRow } from "@/lib/db/schema";
import {
  getAinativeDataDir,
  getAinativeSnapshotsDir,
  getAinativeDbPath,
} from "@/lib/utils/ainative-paths";
import { eq, desc } from "drizzle-orm";
import {
  mkdirSync,
  existsSync,
  statSync,
  rmSync,
  readdirSync,
  writeFileSync,
  readFileSync,
  openSync,
  readSync,
  closeSync,
} from "fs";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "path";
import * as tar from "tar";
import { z } from "zod";
import { relayCellIdOverride } from "@/lib/config/env";
import { relayProductVersion } from "@/lib/config/version";
import { backupAuthStore } from "@/lib/host-ingress/store";

// Directories included in snapshot (relative to ainative data dir)
const SNAPSHOT_DIRS = [
  "uploads",
  "screenshots",
  "outputs",
  "sessions",
  "documents",
  "logs",
];

// Directories excluded from snapshot
const EXCLUDED_DIRS = ["backups", "snapshots"];

// Mutex to prevent concurrent snapshot operations
let snapshotLock = false;

export function isSnapshotLocked(): boolean {
  return snapshotLock;
}

/**
 * Shutdown must consider both the process mutex and its durable shadow state.
 * A snapshot can finish its asynchronous file work between an API observation
 * and SIGTERM while the database row is still transitioning.
 */
export function isSnapshotInProgress(): boolean {
  if (snapshotLock) return true;
  return Boolean(
    sqlite
      .prepare("SELECT 1 FROM snapshots WHERE status = 'in_progress' LIMIT 1")
      .get(),
  );
}

/**
 * A fresh process cannot own an earlier process's snapshot mutex. Convert any
 * durable in-progress rows left by a crash/SIGTERM into visible failures and
 * remove their incomplete artifacts before accepting new snapshot work.
 */
export async function reconcileInterruptedSnapshots(): Promise<number> {
  const interrupted = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.status, "in_progress"));

  for (const snapshot of interrupted) {
    const snapshotsRoot = resolve(getAinativeSnapshotsDir());
    const partialPath = resolve(snapshot.filePath);
    const relativePath = relative(snapshotsRoot, partialPath);
    const contained =
      relativePath.length > 0 &&
      !isAbsolute(relativePath) &&
      relativePath !== ".." &&
      !relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`);
    let error = "SNAPSHOT_INTERRUPTED: Relay stopped before the snapshot completed";

    if (!contained) {
      error = "SNAPSHOT_INTERRUPTED_PATH_REFUSED: partial path is outside the snapshots root";
    } else if (existsSync(partialPath)) {
      try {
        rmSync(partialPath, { recursive: true, force: true });
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        console.error(
          `[snapshots] SNAPSHOT_INTERRUPTED_CLEANUP_FAILED id=${snapshot.id} detail=${detail}`,
        );
        error = "SNAPSHOT_INTERRUPTED_CLEANUP_FAILED: partial files could not be removed";
      }
    }
    await db
      .update(snapshots)
      .set({
        status: "failed",
        error,
      })
      .where(eq(snapshots.id, snapshot.id));
  }

  return interrupted.length;
}

/**
 * Raised when a snapshot operation is requested while another one holds the
 * mutex. Named so callers (the API route) can map lock-contention to 409
 * instead of conflating it with a genuine 500 failure. See issue #24.
 */
export class SnapshotBusyError extends Error {
  constructor() {
    super("Another snapshot operation is already in progress");
    this.name = "SnapshotBusyError";
  }
}

export interface SnapshotManifestV1 {
  version: 1;
  timestamp: string;
  label: string;
  type: "manual" | "auto";
  includedDirs: string[];
  excludedDirs: string[];
  dirStats: Record<string, { fileCount: number; sizeBytes: number }>;
  dbSizeBytes: number;
  filesSizeBytes: number;
  totalSizeBytes: number;
}

export interface SnapshotArtifact {
  file: string;
  sizeBytes: number;
  sha256: string;
  required: boolean;
}

export interface SnapshotManifestV2 {
  version: 2;
  timestamp: string;
  label: string;
  type: "manual" | "auto";
  cellId: string;
  relayVersion: string;
  schemaContractVersion: 1;
  includedDirs: string[];
  excludedDirs: string[];
  dirStats: Record<string, { fileCount: number; sizeBytes: number }>;
  artifacts: Record<"database" | "files" | "auth", SnapshotArtifact | null>;
  dbSizeBytes: number;
  filesSizeBytes: number;
  totalSizeBytes: number;
}

export type SnapshotManifest = SnapshotManifestV1 | SnapshotManifestV2;

const snapshotArtifactSchema: z.ZodType<SnapshotArtifact> = z.object({
  file: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  required: z.boolean(),
}).strict();

const snapshotManifestV2Schema: z.ZodType<SnapshotManifestV2> = z.object({
  version: z.literal(2),
  timestamp: z.string().datetime(),
  label: z.string(),
  type: z.enum(["manual", "auto"]),
  cellId: z.string().min(1),
  relayVersion: z.string().min(1),
  schemaContractVersion: z.literal(1),
  includedDirs: z.array(z.string()),
  excludedDirs: z.array(z.string()),
  dirStats: z.record(z.string(), z.object({ fileCount: z.number().int().nonnegative(), sizeBytes: z.number().int().nonnegative() })),
  artifacts: z.object({
    database: snapshotArtifactSchema,
    files: snapshotArtifactSchema,
    auth: snapshotArtifactSchema.nullable(),
  }).strict(),
  dbSizeBytes: z.number().int().nonnegative(),
  filesSizeBytes: z.number().int().nonnegative(),
  totalSizeBytes: z.number().int().nonnegative(),
}).strict();

export class SnapshotIntegrityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SnapshotIntegrityError";
    this.code = code;
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256File(path: string): string {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes = 0;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function artifact(path: string, file: string, required: boolean): SnapshotArtifact {
  return { file, sizeBytes: statSync(path).size, sha256: sha256File(path), required };
}

export function currentSnapshotCellId(): string {
  return relayCellIdOverride() ?? "direct-cell";
}

/** Calculate total size of files in a directory (recursive). */
function dirSize(dirPath: string): { fileCount: number; sizeBytes: number } {
  if (!existsSync(dirPath)) return { fileCount: 0, sizeBytes: 0 };

  let fileCount = 0;
  let sizeBytes = 0;

  function walk(dir: string) {
    try {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile()) {
          fileCount++;
          sizeBytes += stat.size;
        }
      }
    } catch {
      throw new SnapshotIntegrityError("SNAPSHOT_FILE_READ_FAILED", `Snapshot source could not be read: ${dir}`);
    }
  }

  walk(dirPath);
  return { fileCount, sizeBytes };
}

/**
 * Create a full-state snapshot (DB + files).
 *
 * Public entry point: acquires the mutex, then delegates to the unlocked core.
 * Throws {@link SnapshotBusyError} if another operation holds the lock.
 */
export async function createSnapshot(
  label: string,
  type: "manual" | "auto" = "manual"
): Promise<SnapshotRow> {
  if (snapshotLock) {
    throw new SnapshotBusyError();
  }

  snapshotLock = true;
  try {
    return await createSnapshotUnlocked(label, type);
  } finally {
    snapshotLock = false;
  }
}

/**
 * Create a snapshot WITHOUT touching the mutex.
 *
 * Callers are responsible for holding `snapshotLock` around this. It exists so
 * an already-locked operation (e.g. restoreFromSnapshot's pre-restore safety
 * snapshot) can create a snapshot without self-deadlocking against the public
 * `createSnapshot` lock check (issue #24).
 */
async function createSnapshotUnlocked(
  label: string,
  type: "manual" | "auto" = "manual"
): Promise<SnapshotRow> {
  const id = generateId();
  const now = new Date();
  const sanitizedLabel = label.replace(/[^a-zA-Z0-9-_ ]/g, "_").slice(0, 100);
  const dirName = `${formatTimestamp(now)}_${sanitizedLabel.replace(/\s+/g, "_")}`;
  const snapshotsDir = getAinativeSnapshotsDir();
  const snapshotPath = join(snapshotsDir, dirName);
  const dataDir = getAinativeDataDir();

  try {
    mkdirSync(snapshotPath, { recursive: true });

    // Insert in-progress record
    await db.insert(snapshots).values({
      id,
      label: sanitizedLabel,
      type,
      status: "in_progress",
      filePath: snapshotPath,
      sizeBytes: 0,
      dbSizeBytes: 0,
      filesSizeBytes: 0,
      fileCount: 0,
      createdAt: now,
    });

    // 1. Atomic SQLite backup
    const dbDestPath = join(snapshotPath, "snapshot.db");
    await sqlite.backup(dbDestPath);
    const dbSize = statSync(dbDestPath).size;

    // 2. WAL-safe copy of the separate G-081 auth store when configured.
    const authDestPath = join(snapshotPath, "auth.db");
    const hasAuth = await backupAuthStore(authDestPath);

    // 3. Tarball of file directories
    const tarballPath = join(snapshotPath, "files.tar.gz");
    const existingDirs = SNAPSHOT_DIRS.filter((d) =>
      existsSync(join(dataDir, d))
    );

    let filesSizeBytes = 0;
    let totalFileCount = 0;
    const dirStats: Record<string, { fileCount: number; sizeBytes: number }> =
      {};

    for (const dir of existingDirs) {
      const stats = dirSize(join(dataDir, dir));
      dirStats[dir] = stats;
      filesSizeBytes += stats.sizeBytes;
      totalFileCount += stats.fileCount;
    }

    if (existingDirs.length > 0) {
      await tar.create(
        {
          gzip: true,
          file: tarballPath,
          cwd: dataDir,
        },
        existingDirs
      );
    } else {
      // Create empty tarball
      await tar.create(
        {
          gzip: true,
          file: tarballPath,
          cwd: dataDir,
        },
        []
      );
    }

    const tarballSize = existsSync(tarballPath)
      ? statSync(tarballPath).size
      : 0;
    const totalSize = dbSize + tarballSize;

    // 4. Write a content-free, checksummed v2 manifest.
    const dbArtifact = artifact(dbDestPath, "snapshot.db", true);
    const filesArtifact = artifact(tarballPath, "files.tar.gz", true);
    const authArtifact = hasAuth ? artifact(authDestPath, "auth.db", true) : null;
    const manifest: SnapshotManifestV2 = {
      version: 2,
      timestamp: now.toISOString(),
      label: sanitizedLabel,
      type,
      cellId: currentSnapshotCellId(),
      relayVersion: relayProductVersion(),
      schemaContractVersion: 1,
      includedDirs: existingDirs,
      excludedDirs: EXCLUDED_DIRS,
      dirStats,
      artifacts: { database: dbArtifact, files: filesArtifact, auth: authArtifact },
      dbSizeBytes: dbSize,
      filesSizeBytes,
      totalSizeBytes: totalSize + (authArtifact?.sizeBytes ?? 0),
    };
    writeFileSync(
      join(snapshotPath, "manifest.json"),
      JSON.stringify(manifest, null, 2)
    );

    // 4. Update record with final sizes
    await db
      .update(snapshots)
      .set({
        status: "completed",
        sizeBytes: totalSize + (authArtifact?.sizeBytes ?? 0),
        dbSizeBytes: dbSize,
        filesSizeBytes: tarballSize,
        fileCount: totalFileCount,
      })
      .where(eq(snapshots.id, id));

    const [row] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, id));
    return row;
  } catch (error) {
    // Mark as failed
    try {
      await db
        .update(snapshots)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        })
        .where(eq(snapshots.id, id));
    } catch {
      // If we can't even update the record, clean up the directory
    }

    // Clean up partial snapshot directory
    if (existsSync(snapshotPath)) {
      try {
        rmSync(snapshotPath, { recursive: true, force: true });
      } catch {
        // Best effort cleanup
      }
    }

    throw error;
  }
}

/**
 * List all snapshots, newest first.
 * Checks file existence and marks missing snapshots.
 */
export async function listSnapshots(): Promise<
  (SnapshotRow & { filesMissing: boolean })[]
> {
  const rows = await db
    .select()
    .from(snapshots)
    .orderBy(desc(snapshots.createdAt));

  return rows.map((row) => ({
    ...row,
    filesMissing: row.status === "completed" && !existsSync(row.filePath),
  }));
}

/**
 * Get a single snapshot by ID.
 */
export async function getSnapshot(
  id: string
): Promise<(SnapshotRow & { filesMissing: boolean; manifest: SnapshotManifest | null }) | null> {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.id, id));

  if (!row) return null;

  let manifest: SnapshotManifest | null = null;
  const manifestPath = join(row.filePath, "manifest.json");
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      // Corrupt manifest — continue without it
    }
  }

  return {
    ...row,
    filesMissing: row.status === "completed" && !existsSync(row.filePath),
    manifest,
  };
}

export function readAndVerifySnapshotManifest(
  snapshotPath: string,
  expectedCellId = currentSnapshotCellId(),
): SnapshotManifestV2 {
  const manifestPath = join(snapshotPath, "manifest.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    throw new SnapshotIntegrityError("SNAPSHOT_MANIFEST_INVALID", "Snapshot manifest is missing or invalid.");
  }
  if (!raw || typeof raw !== "object" || (raw as { version?: unknown }).version !== 2) {
    throw new SnapshotIntegrityError("SNAPSHOT_VERSION_UNSUPPORTED", "A verified recovery bundle requires snapshot manifest v2.");
  }
  const parsed = snapshotManifestV2Schema.safeParse(raw);
  if (!parsed.success) throw new SnapshotIntegrityError("SNAPSHOT_MANIFEST_INVALID", "Snapshot manifest does not match the supported v2 schema.");
  const manifest = parsed.data;
  if (manifest.cellId !== expectedCellId) {
    throw new SnapshotIntegrityError("SNAPSHOT_CELL_MISMATCH", "Snapshot belongs to a different Relay Cell.");
  }
  for (const item of Object.values(manifest.artifacts)) {
    if (!item) continue;
    const candidate = resolve(snapshotPath, item.file);
    const rel = relative(resolve(snapshotPath), candidate);
    if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
      throw new SnapshotIntegrityError("SNAPSHOT_ARTIFACT_PATH_INVALID", "Snapshot artifact path escapes its root.");
    }
    if (!existsSync(candidate)) {
      throw new SnapshotIntegrityError("SNAPSHOT_ARTIFACT_MISSING", `Required snapshot artifact is missing: ${item.file}`);
    }
    if (statSync(candidate).size !== item.sizeBytes || sha256File(candidate) !== item.sha256) {
      throw new SnapshotIntegrityError("SNAPSHOT_ARTIFACT_CHECKSUM_MISMATCH", `Snapshot artifact failed verification: ${item.file}`);
    }
  }
  return manifest;
}

function safeSnapshotArchiveEntry(path: string, entryType?: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || !SNAPSHOT_DIRS.includes(parts[0]) || parts.some((part) => part === "..")) {
    throw new SnapshotIntegrityError("SNAPSHOT_ARCHIVE_ENTRY_REFUSED", `Snapshot archive contains an unsafe entry: ${normalized}`);
  }
  if (entryType && !["File", "OldFile", "ContiguousFile", "Directory"].includes(entryType)) {
    throw new SnapshotIntegrityError("SNAPSHOT_ARCHIVE_ENTRY_REFUSED", `Snapshot archive contains an unsafe ${entryType} entry: ${normalized}`);
  }
  return true;
}

/**
 * Delete a snapshot (metadata + files on disk).
 */
export async function deleteSnapshot(id: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.id, id));

  if (!row) return false;

  // Delete files on disk
  if (existsSync(row.filePath)) {
    rmSync(row.filePath, { recursive: true, force: true });
  }

  // Delete metadata
  await db.delete(snapshots).where(eq(snapshots.id, id));
  return true;
}

/**
 * Get total disk usage of all snapshot files.
 */
export async function getSnapshotsSize(): Promise<{
  totalBytes: number;
  snapshotCount: number;
}> {
  const snapshotsDir = getAinativeSnapshotsDir();
  if (!existsSync(snapshotsDir)) return { totalBytes: 0, snapshotCount: 0 };

  const rows = await db.select().from(snapshots);
  let totalBytes = 0;

  for (const row of rows) {
    if (row.status === "completed" && existsSync(row.filePath)) {
      const stats = dirSize(row.filePath);
      totalBytes += stats.sizeBytes;
    }
  }

  return { totalBytes, snapshotCount: rows.length };
}

/**
 * Restore from a snapshot — DESTRUCTIVE operation.
 * Creates a pre-restore safety snapshot, then replaces DB + files.
 * Returns { requiresRestart: true } to signal the server must restart.
 */
export async function restoreFromSnapshot(id: string): Promise<{
  requiresRestart: boolean;
  preRestoreSnapshotId: string;
}> {
  if (snapshotLock) {
    throw new SnapshotBusyError();
  }

  const snapshot = await getSnapshot(id);
  if (!snapshot) throw new Error("Snapshot not found");
  if (snapshot.status !== "completed")
    throw new Error("Cannot restore from incomplete snapshot");
  if (snapshot.filesMissing)
    throw new Error("Snapshot files are missing from disk");

  if (snapshot.manifest?.version === 2) {
    readAndVerifySnapshotManifest(snapshot.filePath);
  }

  const snapshotDbPath = join(snapshot.filePath, "snapshot.db");
  const snapshotTarPath = join(snapshot.filePath, "files.tar.gz");

  if (!existsSync(snapshotDbPath)) {
    throw new Error("Snapshot database file is missing");
  }

  snapshotLock = true;

  try {
    // 1. Create pre-restore safety snapshot. Use the UNLOCKED core: we already
    // hold snapshotLock, and the public createSnapshot would throw
    // SnapshotBusyError against our own lock (the issue #24 deadlock).
    const preRestore = await createSnapshotUnlocked(
      `pre-restore-${formatTimestamp(new Date())}`,
      "auto"
    );

    // 2. Replace file directories
    const dataDir = getAinativeDataDir();

    // Clear existing file directories
    for (const dir of SNAPSHOT_DIRS) {
      const fullPath = join(dataDir, dir);
      if (existsSync(fullPath)) {
        rmSync(fullPath, { recursive: true, force: true });
      }
    }

    // Extract tarball
    if (existsSync(snapshotTarPath)) {
      let unsafeEntry: SnapshotIntegrityError | undefined;
      await tar.extract({
        file: snapshotTarPath,
        cwd: dataDir,
        strict: true,
        filter: (path, entry) => {
          try { return safeSnapshotArchiveEntry(path, "type" in entry ? entry.type : undefined); }
          catch (error) {
            unsafeEntry = error instanceof SnapshotIntegrityError ? error : new SnapshotIntegrityError("SNAPSHOT_ARCHIVE_ENTRY_REFUSED", "Snapshot archive contains an unsafe entry.");
            return false;
          }
        },
      });
      if (unsafeEntry) throw unsafeEntry;
    }

    // 3. Replace database file
    // Close any prepared statements first
    const currentDbPath = getAinativeDbPath();
    const walPath = currentDbPath + "-wal";
    const shmPath = currentDbPath + "-shm";

    // Checkpoint WAL to ensure consistency
    try {
      sqlite.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      // Best effort
    }

    // Copy snapshot DB over current DB
    const { copyFileSync } = await import("fs");
    copyFileSync(snapshotDbPath, currentDbPath);

    const snapshotAuthPath = join(snapshot.filePath, "auth.db");
    if (existsSync(snapshotAuthPath)) {
      copyFileSync(snapshotAuthPath, join(dataDir, "relay-auth.db"));
    }

    // Remove WAL/SHM files (snapshot DB is self-contained)
    if (existsSync(walPath)) rmSync(walPath);
    if (existsSync(shmPath)) rmSync(shmPath);

    return {
      requiresRestart: true,
      preRestoreSnapshotId: preRestore.id,
    };
  } finally {
    snapshotLock = false;
  }
}
