import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPrimitivesSummary,
  deleteApp,
  deleteAppCascade,
  getApp,
  invalidateAppsCache,
  KpiSpecSchema,
  listApps,
  listAppsCached,
  listAppsWithManifestsCached,
  parseAppManifest,
} from "../registry";

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ainative-apps-test-"));
}

function writeManifest(dir: string, appId: string, body: string) {
  const appDir = path.join(dir, appId);
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, "manifest.yaml"), body, "utf-8");
  return appDir;
}

const WEALTH_MANIFEST = `
id: wealth-tracker
version: 0.1.0
name: Wealth Tracker
description: Personal portfolio check-ins.
persona: individual-investor
author: user
profiles:
  - id: wealth-tracker--portfolio-coach
    source: .claude/skills/wealth-tracker--portfolio-coach/
blueprints:
  - id: wealth-tracker--weekly-review
    source: ~/.ainative/blueprints/wealth-tracker--weekly-review.yaml
tables:
  - id: wealth-tracker--positions
    columns: [ticker, qty, cost_basis]
schedules:
  - id: wealth-tracker--monday-8am
    cron: "0 8 * * 1"
    runs: blueprint:wealth-tracker--weekly-review
permissions:
  preset: read-only
`;

describe("parseAppManifest", () => {
  it("parses a well-formed manifest", () => {
    const m = parseAppManifest(WEALTH_MANIFEST);
    expect(m).not.toBeNull();
    expect(m?.id).toBe("wealth-tracker");
    expect(m?.name).toBe("Wealth Tracker");
    expect(m?.profiles).toHaveLength(1);
    expect(m?.blueprints).toHaveLength(1);
    expect(m?.tables).toHaveLength(1);
    expect(m?.schedules).toHaveLength(1);
  });

  it("returns null on invalid yaml", () => {
    expect(parseAppManifest("::: not valid yaml :::")).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    expect(parseAppManifest("name: only a name\n")).toBeNull();
  });

  it("tolerates missing optional sections", () => {
    const minimal = parseAppManifest("id: minimal\nname: Minimal\n");
    expect(minimal).not.toBeNull();
    expect(minimal?.profiles).toEqual([]);
    expect(minimal?.tables).toEqual([]);
  });
});

describe("buildPrimitivesSummary", () => {
  it("renders Calm Ops primitive summary with humanized cron", () => {
    const m = parseAppManifest(WEALTH_MANIFEST)!;
    const s = buildPrimitivesSummary(m);
    expect(s).toContain("Agent");
    expect(s).toContain("Blueprint");
    expect(s).toContain("1 table");
    expect(s).toContain("Monday");
    expect(s).toContain("8am");
    expect(s).toContain(" · ");
  });

  it("pluralizes tables correctly", () => {
    const m = parseAppManifest(`id: a\nname: A\ntables:\n  - id: a--t1\n  - id: a--t2\n`)!;
    expect(buildPrimitivesSummary(m)).toContain("2 tables");
  });

  it("handles empty composition", () => {
    const m = parseAppManifest("id: a\nname: A\n")!;
    expect(buildPrimitivesSummary(m)).toBe("");
  });

  it("omits schedule when no cron", () => {
    const m = parseAppManifest(
      `id: a\nname: A\nschedules:\n  - id: a--s1\n    runs: blueprint:x\n`
    )!;
    const s = buildPrimitivesSummary(m);
    expect(s).toContain("Schedule");
    expect(s).not.toContain("am");
  });
});

describe("listApps", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("returns empty array when dir does not exist", () => {
    expect(listApps(path.join(tmp, "nope"))).toEqual([]);
  });

  it("returns empty array when dir is empty", () => {
    expect(listApps(tmp)).toEqual([]);
  });

  it("lists a single app manifest", () => {
    writeManifest(tmp, "wealth-tracker", WEALTH_MANIFEST);
    const apps = listApps(tmp);
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe("wealth-tracker");
    expect(apps[0].profileCount).toBe(1);
    expect(apps[0].tableCount).toBe(1);
    expect(apps[0].scheduleCount).toBe(1);
  });

  it("lists multiple apps newest first", async () => {
    writeManifest(tmp, "older", "id: older\nname: Older\n");
    // stagger mtime
    await new Promise((r) => setTimeout(r, 10));
    writeManifest(tmp, "newer", "id: newer\nname: Newer\n");
    const apps = listApps(tmp);
    expect(apps.map((a) => a.id)).toEqual(["newer", "older"]);
  });

  it("skips directories without manifest.yaml", () => {
    fs.mkdirSync(path.join(tmp, "stray"), { recursive: true });
    fs.writeFileSync(path.join(tmp, "stray", "README.md"), "# hi", "utf-8");
    expect(listApps(tmp)).toEqual([]);
  });

  it("skips manifests that fail schema validation", () => {
    writeManifest(tmp, "broken", "invalid: yaml: structure: [\n");
    expect(listApps(tmp)).toEqual([]);
  });

  it("collects all files under the app dir", () => {
    const dir = writeManifest(tmp, "wealth-tracker", WEALTH_MANIFEST);
    fs.mkdirSync(path.join(dir, "seed"));
    fs.writeFileSync(path.join(dir, "seed", "positions.csv"), "ticker\n", "utf-8");
    fs.writeFileSync(path.join(dir, "README.md"), "# hi", "utf-8");
    const [app] = listApps(tmp);
    expect(app.files.length).toBeGreaterThanOrEqual(3);
    expect(app.files.some((f) => f.endsWith("positions.csv"))).toBe(true);
  });
});

describe("getApp", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmp(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it("returns detail including manifest", () => {
    writeManifest(tmp, "wealth-tracker", WEALTH_MANIFEST);
    const detail = getApp("wealth-tracker", tmp);
    expect(detail).not.toBeNull();
    expect(detail?.manifest.id).toBe("wealth-tracker");
    expect(detail?.manifest.schedules[0].cron).toBe("0 8 * * 1");
  });

  it("returns null for missing app", () => {
    expect(getApp("nope", tmp)).toBeNull();
  });
});

describe("deleteApp", () => {
  let tmp: string;
  beforeEach(() => { tmp = makeTmp(); });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it("removes the app directory recursively", () => {
    const dir = writeManifest(tmp, "wealth-tracker", WEALTH_MANIFEST);
    fs.writeFileSync(path.join(dir, "README.md"), "# hi", "utf-8");
    expect(deleteApp("wealth-tracker", tmp)).toBe(true);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("returns false for unknown app id without throwing", () => {
    expect(deleteApp("nope", tmp)).toBe(false);
  });

  it("refuses a path-traversal id", () => {
    // Make a sibling dir OUTSIDE appsDir to confirm the guard
    const appsDir = path.join(tmp, "apps");
    fs.mkdirSync(appsDir, { recursive: true });
    const sibling = path.join(tmp, "other");
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, "secret.txt"), "keep me", "utf-8");
    expect(deleteApp("../other", appsDir)).toBe(false);
    expect(fs.existsSync(path.join(sibling, "secret.txt"))).toBe(true);
  });
});

describe("deleteAppCascade", () => {
  let tmp: string;
  let appsDir: string;
  let profilesDir: string;
  let blueprintsDir: string;

  beforeEach(() => {
    tmp = makeTmp();
    appsDir = path.join(tmp, "apps");
    profilesDir = path.join(tmp, "profiles");
    blueprintsDir = path.join(tmp, "blueprints");
    fs.mkdirSync(appsDir, { recursive: true });
    fs.mkdirSync(profilesDir, { recursive: true });
    fs.mkdirSync(blueprintsDir, { recursive: true });
  });
  afterEach(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it("removes the manifest dir and reports project=false when no DB project exists", async () => {
    writeManifest(appsDir, "wealth-tracker", WEALTH_MANIFEST);
    const result = await deleteAppCascade("wealth-tracker", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => false,
    });
    expect(result.filesRemoved).toBe(true);
    expect(result.projectRemoved).toBe(false);
    expect(fs.existsSync(path.join(appsDir, "wealth-tracker"))).toBe(false);
  });

  it("sweeps app:<appId>:* schedule rows registered by the pack installer", async () => {
    const { db } = await import("@/lib/db");
    const { schedules } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const now = new Date();
    db.insert(schedules)
      .values({
        id: "app:wealth-tracker:monday-8am",
        name: "Monday 8am (wealth-tracker)",
        prompt: "App schedule",
        cronExpression: "0 8 * * 1",
        status: "active",
        type: "scheduled",
        firingCount: 0,
        suppressionCount: 0,
        heartbeatSpentToday: 0,
        failureStreak: 0,
        turnBudgetBreachStreak: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    writeManifest(appsDir, "wealth-tracker", WEALTH_MANIFEST);
    const result = await deleteAppCascade("wealth-tracker", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => false,
    });

    expect(result.schedulesRemoved).toBe(1);
    const row = db
      .select()
      .from(schedules)
      .where(eq(schedules.id, "app:wealth-tracker:monday-8am"))
      .get();
    expect(row).toBeUndefined();
  });

  it("returns filesRemoved=false projectRemoved=false for an unknown app id", async () => {
    const result = await deleteAppCascade("does-not-exist", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => false,
    });
    expect(result.filesRemoved).toBe(false);
    expect(result.projectRemoved).toBe(false);
    expect(result.profilesRemoved).toBe(0);
    expect(result.blueprintsRemoved).toBe(0);
  });

  it("refuses path-traversal ids and removes nothing", async () => {
    const sibling = path.join(tmp, "other");
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, "secret.txt"), "keep me", "utf-8");
    const result = await deleteAppCascade("../other", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => false,
    });
    expect(result.filesRemoved).toBe(false);
    expect(fs.existsSync(path.join(sibling, "secret.txt"))).toBe(true);
  });

  it("calls deleteProjectCascade with the app id (verified via injected fn)", async () => {
    writeManifest(appsDir, "wealth-tracker", WEALTH_MANIFEST);
    const calls: string[] = [];
    const result = await deleteAppCascade("wealth-tracker", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: (id) => { calls.push(id); return true; },
    });
    expect(calls).toEqual(["wealth-tracker"]);
    expect(result.projectRemoved).toBe(true);
    expect(result.filesRemoved).toBe(true);
  });

  it("reports projectRemoved=true filesRemoved=false when only the DB row exists (orphaned)", async () => {
    const result = await deleteAppCascade("orphaned-row", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => true,
    });
    expect(result.projectRemoved).toBe(true);
    expect(result.filesRemoved).toBe(false);
  });

  it("sweeps `<appId>--*` profile dirs from the shared profiles dir", async () => {
    writeManifest(appsDir, "wealth-tracker", WEALTH_MANIFEST);
    // Two namespaced + one unrelated + one ambiguous prefix
    fs.mkdirSync(path.join(profilesDir, "wealth-tracker--portfolio-coach"), { recursive: true });
    fs.writeFileSync(path.join(profilesDir, "wealth-tracker--portfolio-coach", "SKILL.md"), "x", "utf-8");
    fs.mkdirSync(path.join(profilesDir, "wealth-tracker--auditor"), { recursive: true });
    fs.mkdirSync(path.join(profilesDir, "habit-loop--coach"), { recursive: true });
    fs.mkdirSync(path.join(profilesDir, "wealth-tracker"), { recursive: true }); // no `--`, must NOT match

    const result = await deleteAppCascade("wealth-tracker", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => false,
    });
    expect(result.profilesRemoved).toBe(2);
    expect(fs.existsSync(path.join(profilesDir, "wealth-tracker--portfolio-coach"))).toBe(false);
    expect(fs.existsSync(path.join(profilesDir, "wealth-tracker--auditor"))).toBe(false);
    expect(fs.existsSync(path.join(profilesDir, "habit-loop--coach"))).toBe(true);
    expect(fs.existsSync(path.join(profilesDir, "wealth-tracker"))).toBe(true);
  });

  it("sweeps `<appId>--*.yaml` blueprint files from the shared blueprints dir", async () => {
    writeManifest(appsDir, "wealth-tracker", WEALTH_MANIFEST);
    fs.writeFileSync(path.join(blueprintsDir, "wealth-tracker--weekly-review.yaml"), "id: a\n", "utf-8");
    fs.writeFileSync(path.join(blueprintsDir, "wealth-tracker--quarterly.yaml"), "id: a\n", "utf-8");
    fs.writeFileSync(path.join(blueprintsDir, "wealth-tracker--notes.txt"), "x", "utf-8"); // wrong ext, must NOT match
    fs.writeFileSync(path.join(blueprintsDir, "habit-loop--coach.yaml"), "id: a\n", "utf-8");

    const result = await deleteAppCascade("wealth-tracker", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => false,
    });
    expect(result.blueprintsRemoved).toBe(2);
    expect(fs.existsSync(path.join(blueprintsDir, "wealth-tracker--weekly-review.yaml"))).toBe(false);
    expect(fs.existsSync(path.join(blueprintsDir, "wealth-tracker--quarterly.yaml"))).toBe(false);
    expect(fs.existsSync(path.join(blueprintsDir, "wealth-tracker--notes.txt"))).toBe(true);
    expect(fs.existsSync(path.join(blueprintsDir, "habit-loop--coach.yaml"))).toBe(true);
  });

  it("is a no-op for namespaced sweeps when no profile/blueprint matches the appId", async () => {
    writeManifest(appsDir, "wealth-tracker", WEALTH_MANIFEST);
    fs.mkdirSync(path.join(profilesDir, "habit-loop--coach"), { recursive: true });
    fs.writeFileSync(path.join(blueprintsDir, "habit-loop--coach.yaml"), "id: a\n", "utf-8");

    const result = await deleteAppCascade("wealth-tracker", {
      appsDir,
      profilesDir,
      blueprintsDir,
      deleteProjectFn: () => false,
    });
    expect(result.profilesRemoved).toBe(0);
    expect(result.blueprintsRemoved).toBe(0);
    expect(result.filesRemoved).toBe(true);
    expect(fs.existsSync(path.join(profilesDir, "habit-loop--coach"))).toBe(true);
    expect(fs.existsSync(path.join(blueprintsDir, "habit-loop--coach.yaml"))).toBe(true);
  });
});

describe("listAppsCached", () => {
  beforeEach(() => {
    invalidateAppsCache();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("returns the same result within 5s without re-reading the filesystem", () => {
    const tmp = makeTmpAppsDir([{ id: "app-a" }]);
    const first = listAppsCached(tmp);
    expect(first.map((a) => a.id)).toEqual(["app-a"]);

    fs.mkdirSync(path.join(tmp, "app-b"));
    fs.writeFileSync(path.join(tmp, "app-b", "manifest.yaml"), "id: app-b\nname: B\n");

    vi.advanceTimersByTime(4000);
    const second = listAppsCached(tmp);
    expect(second.map((a) => a.id)).toEqual(["app-a"]);
  });

  it("re-reads after TTL expires", () => {
    const tmp = makeTmpAppsDir([{ id: "app-a" }]);
    listAppsCached(tmp);

    fs.mkdirSync(path.join(tmp, "app-b"));
    fs.writeFileSync(path.join(tmp, "app-b", "manifest.yaml"), "id: app-b\nname: B\n");

    vi.advanceTimersByTime(5001);
    const fresh = listAppsCached(tmp);
    expect(fresh.map((a) => a.id).sort()).toEqual(["app-a", "app-b"]);
  });

  it("invalidateAppsCache forces a re-read on next call", () => {
    const tmp = makeTmpAppsDir([{ id: "app-a" }]);
    listAppsCached(tmp);

    fs.mkdirSync(path.join(tmp, "app-b"));
    fs.writeFileSync(path.join(tmp, "app-b", "manifest.yaml"), "id: app-b\nname: B\n");

    invalidateAppsCache();
    const fresh = listAppsCached(tmp);
    expect(fresh.map((a) => a.id).sort()).toEqual(["app-a", "app-b"]);
  });

  it("scopes cache by appsDir argument", () => {
    const dirA = makeTmpAppsDir([{ id: "in-a" }]);
    const dirB = makeTmpAppsDir([{ id: "in-b" }]);
    expect(listAppsCached(dirA).map((a) => a.id)).toEqual(["in-a"]);
    expect(listAppsCached(dirB).map((a) => a.id)).toEqual(["in-b"]);
  });
});

function makeTmpAppsDir(apps: Array<{ id: string }>): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "list-apps-cache-"));
  for (const a of apps) {
    fs.mkdirSync(path.join(tmp, a.id));
    fs.writeFileSync(path.join(tmp, a.id, "manifest.yaml"), `id: ${a.id}\nname: ${a.id}\n`);
  }
  return tmp;
}

describe("cache invalidation on mutations", () => {
  beforeEach(() => invalidateAppsCache());

  it("deleteApp() invalidates the cache for its dir", () => {
    const tmp = makeTmpAppsDir([{ id: "app-x" }]);
    expect(listAppsCached(tmp).map((a) => a.id)).toEqual(["app-x"]);

    deleteApp("app-x", tmp);
    expect(listAppsCached(tmp).map((a) => a.id)).toEqual([]);
  });
});

describe("listAppsWithManifestsCached", () => {
  beforeEach(() => {
    invalidateAppsCache();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("returns AppDetail entries with .manifest hydrated", () => {
    const tmp = makeTmpAppsDir([{ id: "app-a" }]);
    const result = listAppsWithManifestsCached(tmp);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe("app-a");
    expect(result[0].manifest).toBeDefined();
    expect(result[0].manifest.id).toBe("app-a");
  });

  it("caches within 5s TTL", () => {
    const tmp = makeTmpAppsDir([{ id: "app-a" }]);
    const first = listAppsWithManifestsCached(tmp);
    fs.mkdirSync(path.join(tmp, "app-b"));
    fs.writeFileSync(path.join(tmp, "app-b", "manifest.yaml"), "id: app-b\nname: B\n");
    vi.advanceTimersByTime(4000);
    const second = listAppsWithManifestsCached(tmp);
    expect(second.length).toBe(first.length);
  });

  it("re-reads after TTL expires", () => {
    const tmp = makeTmpAppsDir([{ id: "app-a" }]);
    listAppsWithManifestsCached(tmp);
    fs.mkdirSync(path.join(tmp, "app-b"));
    fs.writeFileSync(path.join(tmp, "app-b", "manifest.yaml"), "id: app-b\nname: B\n");
    vi.advanceTimersByTime(5001);
    const fresh = listAppsWithManifestsCached(tmp);
    expect(fresh.length).toBe(2);
  });

  it("invalidateAppsCache clears both summary AND with-manifests caches", () => {
    const tmp = makeTmpAppsDir([{ id: "app-a" }]);
    listAppsCached(tmp);              // populates summary cache
    listAppsWithManifestsCached(tmp); // populates manifest cache
    fs.mkdirSync(path.join(tmp, "app-b"));
    fs.writeFileSync(path.join(tmp, "app-b", "manifest.yaml"), "id: app-b\nname: B\n");
    invalidateAppsCache();
    expect(listAppsCached(tmp).length).toBe(2);
    expect(listAppsWithManifestsCached(tmp).length).toBe(2);
  });
});

describe("KpiSpecSchema — tableSumWindowed arm", () => {
  it("accepts a windowed sign-filtered sum spec", () => {
    const spec = {
      id: "inflow",
      label: "Inflow (MTD)",
      format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "transactions",
        column: "amount",
        sign: "positive",
        window: "mtd",
      },
    };
    expect(() => KpiSpecSchema.parse(spec)).not.toThrow();
  });

  it("accepts a windowed unsigned sum (Net)", () => {
    const spec = {
      id: "net",
      label: "Net",
      format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "transactions",
        column: "amount",
        window: "mtd",
      },
    };
    expect(() => KpiSpecSchema.parse(spec)).not.toThrow();
  });

  it("accepts an unwindowed sum (defaults to all-time)", () => {
    const spec = {
      id: "total",
      label: "Total",
      format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "transactions",
        column: "amount",
      },
    };
    expect(() => KpiSpecSchema.parse(spec)).not.toThrow();
  });

  it("rejects an invalid window value", () => {
    const spec = {
      id: "x", label: "x", format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "t", column: "c",
        window: "weekly",
      },
    };
    expect(() => KpiSpecSchema.parse(spec)).toThrow();
  });

  it("rejects an invalid sign value", () => {
    const spec = {
      id: "x", label: "x", format: "currency",
      source: {
        kind: "tableSumWindowed",
        table: "t", column: "c",
        sign: "neutral",
      },
    };
    expect(() => KpiSpecSchema.parse(spec)).toThrow();
  });

  it.each(["higher", "lower", "closer-to-zero", "neutral"] as const)(
    "accepts explicit %s favorability semantics",
    (favorable) => {
      const parsed = KpiSpecSchema.parse({
        id: "trend",
        label: "Trend",
        source: {
          kind: "tableSumWindowed",
          table: "t",
          column: "amount",
          window: "mtd",
        },
        semantics: { favorable },
      });
      expect(parsed.semantics?.favorable).toBe(favorable);
    }
  );

  it("keeps semantics optional and defaults an empty declaration to neutral", () => {
    const base = {
      id: "trend",
      label: "Trend",
      source: { kind: "tableCount", table: "t" },
    };
    expect(KpiSpecSchema.parse(base).semantics).toBeUndefined();
    expect(
      KpiSpecSchema.parse({ ...base, semantics: {} }).semantics?.favorable
    ).toBe("neutral");
  });

  it("rejects an unknown favorability policy", () => {
    expect(() =>
      KpiSpecSchema.parse({
        id: "trend",
        label: "Trend",
        source: { kind: "tableCount", table: "t" },
        semantics: { favorable: "always-green" },
      })
    ).toThrow();
  });
});
