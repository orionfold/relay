import { NextResponse } from "next/server";
import { basename, join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import Database from "better-sqlite3";
import { getLaunchCwd } from "@/lib/environment/workspace-context";
import { isDevMode, isPrivateInstance } from "@/lib/instance/detect";
import { bootstrapAinativeDatabase } from "@/lib/db/bootstrap";

export const dynamic = "force-dynamic";

/**
 * POST /api/workspace/fix-data-dir
 *
 * Fixes a data-dir mismatch for domain clones by:
 * 1. Deriving the correct AINATIVE_DATA_DIR from the folder name
 * 2. Writing it to .env.local
 * 3. Creating the data dir + bootstrapping an empty database there
 *
 * Requires a dev server restart to take effect.
 */
export async function POST() {
  const cwd = getLaunchCwd();

  // Guard: main repo doesn't need fixing
  if (isDevMode(cwd)) {
    return NextResponse.json(
      { error: "Main dev repo does not need a data-dir fix" },
      { status: 400 }
    );
  }

  // Guard: already isolated
  if (isPrivateInstance()) {
    return NextResponse.json(
      { error: "AINATIVE_DATA_DIR is already set to a non-default path" },
      { status: 400 }
    );
  }

  const folderName = basename(cwd);
  const home = homedir();
  // relay-wealth → ~/.relay-wealth, relay-growth → ~/.relay-growth
  const dataDir = join(home, `.${folderName}`);
  const displayDataDir = `~/.${folderName}`;

  // --- 1. Update .env.local ---
  const envLocalPath = join(cwd, ".env.local");
  let envContent = "";
  if (existsSync(envLocalPath)) {
    envContent = readFileSync(envLocalPath, "utf-8");
  }

  // Replace or append RELAY_DATA_DIR
  if (/^RELAY_DATA_DIR=.*/m.test(envContent)) {
    envContent = envContent.replace(
      /^RELAY_DATA_DIR=.*/m,
      `RELAY_DATA_DIR=${dataDir}`
    );
  } else {
    envContent = envContent.trimEnd() + `\nRELAY_DATA_DIR=${dataDir}\n`;
  }

  writeFileSync(envLocalPath, envContent, "utf-8");

  // --- 2. Create data dir + bootstrap DB ---
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, "relay.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  bootstrapAinativeDatabase(sqlite);
  sqlite.close();

  return NextResponse.json({
    success: true,
    dataDir: displayDataDir,
    envLocalPath,
    needsRestart: true,
  });
}
