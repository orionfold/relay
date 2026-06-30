/**
 * File-based backup manager for global paths (~/.claude/, ~/.codex/).
 * Git checkpoints work for project dirs; this handles user-level configs.
 */

import {
  copyFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  readFileSync,
} from "fs";
import { join, dirname, relative, basename } from "path";
import { homedir } from "os";
import { dataDir } from "@/lib/config/env";

const BACKUPS_DIR = join(dataDir(), "backups");

interface BackupResult {
  backupPath: string;
  filesCount: number;
}

/** Create a timestamped backup directory. */
function createBackupDir(label: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dirName = `${timestamp}_${label.replace(/[^a-zA-Z0-9-_]/g, "_")}`;
  const backupPath = join(BACKUPS_DIR, dirName);
  mkdirSync(backupPath, { recursive: true });
  return backupPath;
}

/**
 * Backup specific files from a global directory.
 * Preserves relative paths within the backup.
 */
export function backupFiles(
  filePaths: string[],
  label: string
): BackupResult {
  const backupPath = createBackupDir(label);
  let filesCount = 0;

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;

    const stat = statSync(filePath);
    if (!stat.isFile()) continue;

    // Preserve path structure relative to home
    const relPath = relative(homedir(), filePath);
    const destPath = join(backupPath, relPath);

    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(filePath, destPath);
    filesCount++;
  }

  return { backupPath, filesCount };
}

/**
 * Backup an entire directory (shallow — files only, no recursion into subdirs).
 */
export function backupDirectory(
  dirPath: string,
  label: string
): BackupResult {
  if (!existsSync(dirPath)) {
    return { backupPath: "", filesCount: 0 };
  }

  const files: string[] = [];
  try {
    for (const entry of readdirSync(dirPath)) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);
      if (stat.isFile()) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory unreadable
  }

  return backupFiles(files, label);
}

/** Restore files from a backup directory back to their original locations. */
export function restoreFromBackup(backupPath: string): {
  restored: number;
  errors: string[];
} {
  if (!existsSync(backupPath)) {
    return { restored: 0, errors: [`Backup not found: ${backupPath}`] };
  }

  let restored = 0;
  const errors: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile()) {
        // Reconstruct original path from backup relative path
        const relPath = relative(backupPath, fullPath);
        const originalPath = join(homedir(), relPath);

        try {
          mkdirSync(dirname(originalPath), { recursive: true });
          copyFileSync(fullPath, originalPath);
          restored++;
        } catch (e) {
          errors.push(
            `Failed to restore ${originalPath}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }
    }
  }

  walk(backupPath);
  return { restored, errors };
}

/** List all backups. */
export function listBackups(): Array<{
  name: string;
  path: string;
  createdAt: Date;
}> {
  mkdirSync(BACKUPS_DIR, { recursive: true });

  try {
    return readdirSync(BACKUPS_DIR)
      .map((name) => {
        const path = join(BACKUPS_DIR, name);
        const stat = statSync(path);
        return { name, path, createdAt: stat.birthtime };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

/** Delete a backup directory. */
export function deleteBackup(backupPath: string): boolean {
  if (!existsSync(backupPath)) return false;

  try {
    // Recursive delete
    const { rmSync } = require("fs");
    rmSync(backupPath, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
