import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  ensureAppProject,
  extractAppIdFromArtifactId,
  upsertAppManifest,
} from "../compose-integration";
import {
  invalidateAppsCache,
  listApps,
  listAppsCached,
  parseAppManifest,
} from "../registry";

function makeTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ainative-compose-int-test-"));
}

describe("extractAppIdFromArtifactId", () => {
  it("extracts app id from double-hyphen-namespaced id", () => {
    expect(extractAppIdFromArtifactId("reading-radar--manager")).toBe(
      "reading-radar"
    );
  });

  it("returns null for single-hyphen id", () => {
    expect(extractAppIdFromArtifactId("sales-researcher")).toBeNull();
  });

  it("returns null for nullish input", () => {
    expect(extractAppIdFromArtifactId(null)).toBeNull();
    expect(extractAppIdFromArtifactId(undefined)).toBeNull();
  });

  it("returns null when id starts with --", () => {
    expect(extractAppIdFromArtifactId("--foo")).toBeNull();
  });
});

describe("ensureAppProject", () => {
  let tmpAppsDir: string;
  beforeEach(() => {
    tmpAppsDir = makeTmp();
  });
  afterEach(async () => {
    await db.delete(projects).where(eq(projects.id, "compose-int-test-app"));
    await db.delete(projects).where(eq(projects.id, "another-test-app"));
    await db.delete(projects).where(eq(projects.id, "manifest-named-app"));
    fs.rmSync(tmpAppsDir, { recursive: true, force: true });
  });

  it("creates a projects row named from the slug when no manifest exists", async () => {
    const result = await ensureAppProject("compose-int-test-app", tmpAppsDir);
    expect(result.projectId).toBe("compose-int-test-app");
    expect(result.created).toBe(true);

    const row = await db
      .select()
      .from(projects)
      .where(eq(projects.id, "compose-int-test-app"))
      .get();
    expect(row).toBeDefined();
    expect(row?.name).toBe("Compose Int Test App");
    expect(row?.status).toBe("active");
  });

  it("is idempotent — second call does not duplicate", async () => {
    const first = await ensureAppProject("compose-int-test-app", tmpAppsDir);
    const second = await ensureAppProject("compose-int-test-app", tmpAppsDir);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.projectId).toBe(first.projectId);
  });

  it("derives the slug-cased name when no manifest exists for another app", async () => {
    const { projectId } = await ensureAppProject("another-test-app", tmpAppsDir);
    const row = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    expect(row?.name).toBe("Another Test App");
  });

  it("prefers the manifest's name over the slug-cased label when manifest exists (F8)", async () => {
    upsertAppManifest(
      "manifest-named-app",
      { kind: "profile", id: "manifest-named-app--coach" },
      "Portfolio Manager",
      tmpAppsDir
    );

    const { projectId } = await ensureAppProject("manifest-named-app", tmpAppsDir);
    const row = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    expect(row?.name).toBe("Portfolio Manager");
  });
});

describe("upsertAppManifest", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = makeTmp();
  });
  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates manifest.yaml on first call and adds the artifact", () => {
    const manifest = upsertAppManifest(
      "my-app",
      { kind: "profile", id: "my-app--manager", source: "~/.claude/skills/my-app--manager/" },
      "My App",
      tmp
    );

    const manifestPath = path.join(tmp, "my-app", "manifest.yaml");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const parsed = parseAppManifest(fs.readFileSync(manifestPath, "utf-8"));
    expect(parsed?.id).toBe("my-app");
    expect(parsed?.name).toBe("My App");
    expect(parsed?.profiles).toHaveLength(1);
    expect(parsed?.profiles[0].id).toBe("my-app--manager");

    expect(manifest.profiles[0].id).toBe("my-app--manager");
  });

  it("appends a second artifact without clobbering the first", () => {
    upsertAppManifest(
      "my-app",
      { kind: "profile", id: "my-app--manager" },
      "My App",
      tmp
    );
    upsertAppManifest(
      "my-app",
      { kind: "blueprint", id: "my-app--workflow" },
      "My App",
      tmp
    );

    const manifestPath = path.join(tmp, "my-app", "manifest.yaml");
    const parsed = parseAppManifest(fs.readFileSync(manifestPath, "utf-8"))!;
    expect(parsed.profiles).toHaveLength(1);
    expect(parsed.blueprints).toHaveLength(1);
  });

  it("is idempotent — adding the same id twice does not duplicate", () => {
    upsertAppManifest(
      "my-app",
      { kind: "table", id: "table-abc-123", columns: ["name", "ticker"] },
      "My App",
      tmp
    );
    upsertAppManifest(
      "my-app",
      { kind: "table", id: "table-abc-123", columns: ["name", "ticker"] },
      "My App",
      tmp
    );

    const parsed = parseAppManifest(
      fs.readFileSync(path.join(tmp, "my-app", "manifest.yaml"), "utf-8")
    )!;
    expect(parsed.tables).toHaveLength(1);
  });

  it("writes schedule entries with cron + runs", () => {
    upsertAppManifest(
      "my-app",
      {
        kind: "schedule",
        id: "sched-xyz",
        cron: "0 8 * * 1",
        runs: "profile:my-app--manager",
      },
      "My App",
      tmp
    );

    const parsed = parseAppManifest(
      fs.readFileSync(path.join(tmp, "my-app", "manifest.yaml"), "utf-8")
    )!;
    expect(parsed.schedules).toHaveLength(1);
    expect(parsed.schedules[0].cron).toBe("0 8 * * 1");
    expect(parsed.schedules[0].runs).toBe("profile:my-app--manager");
  });

  it("produces manifests that listApps() can read", () => {
    upsertAppManifest(
      "listable-app",
      { kind: "profile", id: "listable-app--agent" },
      "Listable App",
      tmp
    );
    upsertAppManifest(
      "listable-app",
      { kind: "blueprint", id: "listable-app--workflow" },
      "Listable App",
      tmp
    );

    const apps = listApps(tmp);
    expect(apps).toHaveLength(1);
    expect(apps[0].id).toBe("listable-app");
    expect(apps[0].name).toBe("Listable App");
    expect(apps[0].origin).toBe("user-created");
    expect(apps[0].profileCount).toBe(1);
    expect(apps[0].blueprintCount).toBe(1);
  });

  it("tolerates a pre-existing but malformed manifest by starting fresh", () => {
    const appDir = path.join(tmp, "busted-app");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "manifest.yaml"),
      "not: [valid yaml: at all",
      "utf-8"
    );

    upsertAppManifest(
      "busted-app",
      { kind: "profile", id: "busted-app--agent" },
      "Busted App",
      tmp
    );

    const parsed = parseAppManifest(
      fs.readFileSync(path.join(appDir, "manifest.yaml"), "utf-8")
    );
    expect(parsed?.id).toBe("busted-app");
    expect(parsed?.profiles).toHaveLength(1);
    expect(parsed?.origin).toBe("user-created");
  });

  it("preserves installed-Pack ownership when composition adds a primitive", () => {
    const appDir = path.join(tmp, "installed-app");
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(
      path.join(appDir, "manifest.yaml"),
      yaml.dump({
        id: "installed-app",
        name: "Installed App",
        origin: "installed-pack",
      })
    );

    upsertAppManifest(
      "installed-app",
      { kind: "profile", id: "installed-app--custom-helper" },
      "Installed App",
      tmp
    );

    const parsed = parseAppManifest(
      fs.readFileSync(path.join(appDir, "manifest.yaml"), "utf-8")
    );
    expect(parsed?.origin).toBe("installed-pack");
  });

  it("writes yaml that round-trips cleanly", () => {
    upsertAppManifest(
      "trip-app",
      { kind: "profile", id: "trip-app--one" },
      "Trip App",
      tmp
    );
    const raw = fs.readFileSync(path.join(tmp, "trip-app", "manifest.yaml"), "utf-8");
    const loaded = yaml.load(raw) as Record<string, unknown>;
    expect(loaded.id).toBe("trip-app");
    expect(Array.isArray(loaded.profiles)).toBe(true);
  });
});

describe("upsertAppManifest invalidates apps cache", () => {
  it("forces fresh listApps result after a manifest write", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "upsert-cache-"));
    invalidateAppsCache();

    expect(listAppsCached(tmp)).toEqual([]);

    upsertAppManifest("new-app", { kind: "table", id: "tbl-a" }, "New app", tmp);

    // If the cache hadn't been invalidated, this would still return [].
    expect(listAppsCached(tmp).map((a) => a.id)).toEqual(["new-app"]);
  });
});
