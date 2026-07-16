import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname } from "node:path";

export const BETTER_SQLITE3_RECOVERY_COMMAND =
  "npx --yes --allow-scripts=better-sqlite3 orionfold-relay@latest";

type Probe = () => void | Promise<void>;

export type NativeBindingRepairResult = {
  status: number | null;
  error?: Error;
};

type Repair = () => NativeBindingRepairResult | Promise<NativeBindingRepairResult>;

export type NativeBindingPreflightOptions = {
  probe?: Probe;
  repair?: Repair;
  log?: (message: string) => void;
};

export type NativeBindingPreflightResult = {
  repaired: boolean;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Named terminal failure for Relay's load-bearing SQLite native dependency.
 * The CLI prints only this actionable message instead of leaking the raw
 * `bindings` package search stack to a first-run customer.
 */
export class BetterSqlite3NativeBindingUnavailableError extends Error {
  readonly recoveryCommand = BETTER_SQLITE3_RECOVERY_COMMAND;
  readonly initialCause: unknown;
  readonly repairCause?: unknown;

  constructor(initialCause: unknown, repairCause?: unknown) {
    const repairDetail = repairCause
      ? `\nRepair failed: ${errorMessage(repairCause)}`
      : "";
    super(
      "Relay could not load the better-sqlite3 native binding after one scoped repair attempt." +
        `\nInitial failure: ${errorMessage(initialCause)}` +
        repairDetail +
        "\nRun exactly this command to reinstall Relay with the required npm script approval:" +
        `\n  ${BETTER_SQLITE3_RECOVERY_COMMAND}`,
      { cause: repairCause ?? initialCause },
    );
    this.name = "BetterSqlite3NativeBindingUnavailableError";
    this.initialCause = initialCause;
    this.repairCause = repairCause;
  }
}

async function probeBetterSqlite3(): Promise<void> {
  // This MUST remain dynamic. A static import would fail before Relay can name
  // the problem when npm 12 blocks better-sqlite3's install script.
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.close();
}

function repairBetterSqlite3(): NativeBindingRepairResult {
  try {
    const require = createRequire(import.meta.url);
    const packageDir = dirname(require.resolve("better-sqlite3/package.json"));
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

    // Invoke only better-sqlite3's reviewed install hook. An explicit
    // `npm run install` is intentionally allowed by npm even when dependency
    // lifecycle scripts were blocked during a one-off npm exec/npx install.
    // This avoids mutating the user's global npm policy or approving every
    // dependency script as part of recovery.
    const result = spawnSync(
      npmCommand,
      ["run", "install", "--foreground-scripts"],
      {
        cwd: packageDir,
        env: process.env,
        stdio: "inherit",
      },
    );
    return {
      status: result.status,
      error: result.error,
    };
  } catch (error) {
    return {
      status: null,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Prove the native binding can actually open SQLite before importing Relay's
 * database graph. A missing binding gets one loud, package-scoped repair and
 * one verification retry; every terminal path names the exact reinstall
 * command. Healthy npm 10/11 installs do no work and emit no output.
 */
export async function ensureBetterSqlite3NativeBinding(
  options: NativeBindingPreflightOptions = {},
): Promise<NativeBindingPreflightResult> {
  const probe = options.probe ?? probeBetterSqlite3;
  const repair = options.repair ?? repairBetterSqlite3;
  const log = options.log ?? console.log;

  let initialCause: unknown;
  try {
    await probe();
    return { repaired: false };
  } catch (error) {
    initialCause = error;
  }

  log(
    "Relay detected that the better-sqlite3 native binding is unavailable. " +
      "Attempting one scoped repair now...",
  );

  const repairResult = await repair();
  if (repairResult.status !== 0) {
    const repairCause =
      repairResult.error ??
      new Error(`better-sqlite3 install hook exited with status ${String(repairResult.status)}`);
    throw new BetterSqlite3NativeBindingUnavailableError(initialCause, repairCause);
  }

  try {
    await probe();
  } catch (error) {
    throw new BetterSqlite3NativeBindingUnavailableError(initialCause, error);
  }

  log("Relay repaired the better-sqlite3 native binding. Continuing startup.");
  return { repaired: true };
}
