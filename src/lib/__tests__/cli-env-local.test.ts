import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";

/**
 * Integration tests for bin/cli.ts env handling. Uses `node dist/cli.js --help`
 * as a probe — commander exits after printing help, which is generated from
 * getHelpText() that calls getAinativeDataDir(). So the printed "Directory"
 * line reflects the state of process.env.RELAY_DATA_DIR after the
 * .env.local auto-writer + loader have run.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const CLI_PATH = join(PROJECT_ROOT, "dist", "cli.js");

function runCli(args: string[], opts: { cwd: string; env?: NodeJS.ProcessEnv }) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: opts.cwd,
    env: { ...opts.env, PATH: process.env.PATH },
    encoding: "utf-8",
    timeout: 10_000,
  });
}

describe("bin/cli.ts .env.local handling", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "ainative-cli-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("dist/cli.js exists (run `npm run build:cli` if missing)", () => {
    expect(existsSync(CLI_PATH)).toBe(true);
  });

  it(".env.local RELAY_DATA_DIR overrides shell env (Fix-button recovery path)", () => {
    const envLocalPath = join(tempDir, ".env.local");
    const fileValue = join(tempDir, "from-env-local-dir");
    const shellValue = join(tempDir, "stale-shell-dir");
    writeFileSync(envLocalPath, `RELAY_DATA_DIR=${fileValue}\n`, "utf-8");

    const result = runCli(["--help"], {
      cwd: tempDir,
      env: { RELAY_DATA_DIR: shellValue },
    });

    expect(result.status).toBe(0);
    // Help output includes "Directory        <resolved path>" — file must win.
    expect(result.stdout).toContain(fileValue);
    expect(result.stdout).not.toContain(shellValue);
  });

  it("first-run auto-writer creates .env.local when folder has none and shell has no RELAY_DATA_DIR", () => {
    const envLocalPath = join(tempDir, ".env.local");
    expect(existsSync(envLocalPath)).toBe(false);

    const result = runCli(["--help"], {
      cwd: tempDir,
      env: {}, // no RELAY_DATA_DIR, no RELAY_DEV_MODE
    });

    expect(result.status).toBe(0);
    expect(existsSync(envLocalPath)).toBe(true);

    const contents = readFileSync(envLocalPath, "utf-8");
    const folderName = basename(tempDir);
    expect(contents).toMatch(new RegExp(`RELAY_DATA_DIR=.*\\.${folderName}$`, "m"));
    // Help output must reflect the auto-written value, not the default ~/.ainative.
    expect(result.stdout).toMatch(new RegExp(`Directory\\s+.*\\.${folderName}`));
  });

  it("auto-writer is skipped when RELAY_DEV_MODE=true (main dev repo)", () => {
    const envLocalPath = join(tempDir, ".env.local");
    expect(existsSync(envLocalPath)).toBe(false);

    const result = runCli(["--help"], {
      cwd: tempDir,
      env: { RELAY_DEV_MODE: "true" },
    });

    expect(result.status).toBe(0);
    expect(existsSync(envLocalPath)).toBe(false);
  });

  it("auto-writer is skipped when .git/relay-dev-mode sentinel exists", () => {
    const envLocalPath = join(tempDir, ".env.local");
    mkdirSync(join(tempDir, ".git"), { recursive: true });
    writeFileSync(join(tempDir, ".git", "relay-dev-mode"), "", "utf-8");

    const result = runCli(["--help"], {
      cwd: tempDir,
      env: {},
    });

    expect(result.status).toBe(0);
    expect(existsSync(envLocalPath)).toBe(false);
  });

  it("auto-writer is skipped when shell already sets RELAY_DATA_DIR (user chose explicitly)", () => {
    const envLocalPath = join(tempDir, ".env.local");
    const shellValue = join(tempDir, "user-shell-dir");

    const result = runCli(["--help"], {
      cwd: tempDir,
      env: { RELAY_DATA_DIR: shellValue },
    });

    expect(result.status).toBe(0);
    expect(existsSync(envLocalPath)).toBe(false);
    expect(result.stdout).toContain(shellValue);
  });
});
