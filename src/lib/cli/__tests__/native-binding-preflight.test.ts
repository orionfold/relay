import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BETTER_SQLITE3_RECOVERY_COMMAND,
  BetterSqlite3NativeBindingUnavailableError,
  ensureBetterSqlite3NativeBinding,
} from "../native-binding-preflight";

describe("ensureBetterSqlite3NativeBinding", () => {
  it("runs before the CLI's database-bearing import graph", () => {
    const cliSource = readFileSync(resolve(process.cwd(), "bin", "cli.ts"), "utf8");
    const serverPreflight = cliSource.indexOf(
      "await ensureNativeSqliteOrExit();",
      cliSource.indexOf("program.parse();"),
    );
    const firstDatabaseImport = cliSource.indexOf(
      'await import("../src/lib/utils/migrate-to-ainative")',
    );

    expect(cliSource).not.toMatch(/^import .*better-sqlite3/m);
    expect(cliSource).not.toMatch(/^import .*\.\.\/src\/lib\/db/m);
    expect(serverPreflight).toBeGreaterThan(-1);
    expect(firstDatabaseImport).toBeGreaterThan(serverPreflight);
  });

  it("leaves a healthy npm 11-style install unchanged and silent", async () => {
    const probe = vi.fn();
    const repair = vi.fn();
    const log = vi.fn();

    await expect(
      ensureBetterSqlite3NativeBinding({ probe, repair, log }),
    ).resolves.toEqual({ repaired: false });

    expect(probe).toHaveBeenCalledOnce();
    expect(repair).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("repairs a blocked binding loudly and verifies it before continuing", async () => {
    const probe = vi
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new Error("Could not locate the bindings file");
      })
      .mockImplementationOnce(() => undefined);
    const repair = vi.fn().mockReturnValue({ status: 0 });
    const log = vi.fn();

    await expect(
      ensureBetterSqlite3NativeBinding({ probe, repair, log }),
    ).resolves.toEqual({ repaired: true });

    expect(probe).toHaveBeenCalledTimes(2);
    expect(repair).toHaveBeenCalledOnce();
    expect(log.mock.calls.flat().join("\n")).toMatch(/detected.*unavailable/i);
    expect(log.mock.calls.flat().join("\n")).toMatch(/repaired.*continuing/i);
  });

  it("names a failed repair and gives one exact recovery command", async () => {
    const initialFailure = new Error("Could not locate the bindings file");
    const probe = vi.fn(() => {
      throw initialFailure;
    });
    const repair = vi.fn().mockReturnValue({ status: 7 });

    const failure = await ensureBetterSqlite3NativeBinding({
      probe,
      repair,
      log: vi.fn(),
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(BetterSqlite3NativeBindingUnavailableError);
    expect(failure).toMatchObject({
      name: "BetterSqlite3NativeBindingUnavailableError",
      recoveryCommand: BETTER_SQLITE3_RECOVERY_COMMAND,
      initialCause: initialFailure,
    });
    expect((failure as Error).message).toContain(BETTER_SQLITE3_RECOVERY_COMMAND);
    expect((failure as Error).message.match(/npx --yes/g)).toHaveLength(1);
    expect((failure as Error).message).toMatch(/exited with status 7/);
  });

  it("refuses to continue when a nominally successful repair leaves the binding broken", async () => {
    const probe = vi
      .fn<() => void>()
      .mockImplementationOnce(() => {
        throw new Error("binding absent");
      })
      .mockImplementationOnce(() => {
        throw new Error("binding still absent");
      });

    await expect(
      ensureBetterSqlite3NativeBinding({
        probe,
        repair: vi.fn().mockReturnValue({ status: 0 }),
        log: vi.fn(),
      }),
    ).rejects.toMatchObject({
      name: "BetterSqlite3NativeBindingUnavailableError",
      message: expect.stringContaining("binding still absent"),
    });
  });
});
