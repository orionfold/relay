import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

/**
 * Guard for the row-insert var-mapping gap (fix-row-insert-trigger-var-mapping).
 *
 * A row-insert trigger fires with NO human in the loop, so every REQUIRED
 * variable on the triggered blueprint MUST be auto-fillable from the inserted
 * row — a column named exactly like the variable (dispatch passthrough) or a
 * `{{row.<col>}}` default naming a real column of the trigger table. A pack
 * that violates this installs clean, then throws "Missing required variables"
 * the moment the first row lands.
 *
 * `install.ts` block 2d now REFUSES such a pack at install time. These tests:
 *   1. sweep EVERY shipped pack template so a future pack can't reintroduce
 *      the gap (the four originally-broken blueprints — relay-cre
 *      lease-abstraction, relay-crm lead-enrich, relay-social repurpose +
 *      welcome-creative — are the regression anchors);
 *   2. prove the install-time guard actually throws on a synthetic broken pack
 *      (so the guard itself can't silently rot to a no-op).
 */

const TEMPLATES = path.join("src", "lib", "packs", "templates");
const ROW_DEFAULT = /^\{\{\s*row\.([a-zA-Z0-9_-]+)\s*\}\}$/;

interface TriggerVarCase {
  pack: string;
  blueprintId: string;
  table: string;
  columns: string[];
  variables: Array<{ id: string; required?: boolean; default?: unknown }>;
}

interface ScheduledVarCase {
  pack: string;
  scheduleId: string;
  blueprintId: string;
  variables: Array<{ id: string; required?: boolean; default?: unknown }>;
}

/** Enumerate every row-insert-triggered blueprint whose trigger table is
 *  declared in the SAME manifest (a cross-child trigger whose table lives in
 *  another pack is inert standalone and validated only in the merged bundle). */
function collectRowTriggerCases(): TriggerVarCase[] {
  const out: TriggerVarCase[] = [];
  for (const pack of fs.readdirSync(TEMPLATES)) {
    const mf = path.join(TEMPLATES, pack, "base", "manifest.yaml");
    if (!fs.existsSync(mf)) continue;
    const manifest = yaml.load(fs.readFileSync(mf, "utf-8")) as {
      blueprints?: Array<{
        id: string;
        source?: string;
        trigger?: { kind?: string; table?: string };
      }>;
      tables?: Array<{ id: string; columns?: string[] }>;
    };
    const columnsByTable = new Map<string, string[]>();
    for (const t of manifest.tables ?? []) columnsByTable.set(t.id, t.columns ?? []);

    for (const bp of manifest.blueprints ?? []) {
      if (bp.trigger?.kind !== "row-insert" || !bp.trigger.table) continue;
      const columns = columnsByTable.get(bp.trigger.table);
      if (!columns) continue; // trigger table not declared here → inert
      const src = bp.source?.replace(
        "$AINATIVE_DATA_DIR",
        path.join(TEMPLATES, pack, "base")
      );
      if (!src || !fs.existsSync(src)) continue;
      const blueprint = yaml.load(fs.readFileSync(src, "utf-8")) as {
        variables?: Array<{ id: string; required?: boolean; default?: unknown }>;
      };
      out.push({
        pack,
        blueprintId: bp.id,
        table: bp.trigger.table,
        columns,
        variables: blueprint.variables ?? [],
      });
    }
  }
  return out;
}

function unfillableRequiredVars(c: TriggerVarCase): string[] {
  const cols = new Set(c.columns);
  return c.variables
    .filter((v) => v.required === true)
    .filter((v) => {
      if (cols.has(v.id)) return false; // passthrough
      const defStr = typeof v.default === "string" ? v.default : null;
      const m = defStr ? ROW_DEFAULT.exec(defStr) : null;
      return !(m && cols.has(m[1])); // no row-default on a real column
    })
    .map((v) => v.id);
}

function collectScheduledCases(): ScheduledVarCase[] {
  const out: ScheduledVarCase[] = [];
  for (const pack of fs.readdirSync(TEMPLATES)) {
    const mf = path.join(TEMPLATES, pack, "base", "manifest.yaml");
    if (!fs.existsSync(mf)) continue;
    const manifest = yaml.load(fs.readFileSync(mf, "utf-8")) as {
      blueprints?: Array<{ id: string; source?: string }>;
      schedules?: Array<{ id: string; runs?: string }>;
    };
    const blueprintsById = new Map(
      (manifest.blueprints ?? []).map((bp) => [bp.id, bp])
    );

    for (const sched of manifest.schedules ?? []) {
      if (!sched.runs) continue;
      const bp = blueprintsById.get(sched.runs);
      const src = bp?.source?.replace(
        "$AINATIVE_DATA_DIR",
        path.join(TEMPLATES, pack, "base")
      );
      if (!src || !fs.existsSync(src)) continue;
      const blueprint = yaml.load(fs.readFileSync(src, "utf-8")) as {
        variables?: Array<{ id: string; required?: boolean; default?: unknown }>;
      };
      out.push({
        pack,
        scheduleId: sched.id,
        blueprintId: sched.runs,
        variables: blueprint.variables ?? [],
      });
    }
  }
  return out;
}

function scheduledVarsWithoutDefaults(c: ScheduledVarCase): string[] {
  return c.variables
    .filter((v) => v.required === true)
    .filter((v) => v.default === undefined || v.default === null)
    .map((v) => v.id);
}

describe("row-insert trigger var fillability — shipped pack sweep", () => {
  const cases = collectRowTriggerCases();

  it("has row-insert-triggered blueprints to check (guard is not vacuous)", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)(
    "$pack/$blueprintId: every required var is fillable from table $table",
    (c) => {
      const bad = unfillableRequiredVars(c);
      expect(
        bad,
        `${c.pack}/${c.blueprintId}: required var(s) ${bad.join(", ")} ` +
          `cannot be filled from an inserted "${c.table}" row ` +
          `(columns: ${c.columns.join(", ")}). Give each a {{row.<col>}} ` +
          `default or make it optional.`
      ).toEqual([]);
    }
  );

  it("covers the originally-broken blueprints visible in a standalone install", () => {
    const ids = new Set(cases.map((c) => `${c.pack}/${c.blueprintId}`));
    // welcome-creative triggers on the CRM-owned `leads` table, which
    // relay-social does NOT declare standalone — it is inert until the bundle
    // flatten, so it is validated by relay-marketing-bundle-template.test.ts,
    // not this standalone sweep.
    for (const anchor of [
      "relay-cre/relay-cre--lease-abstraction",
      "relay-crm/relay-crm--lead-enrich",
      "relay-social/relay-social--repurpose",
    ]) {
      expect(ids.has(anchor), `${anchor} must be in the swept set`).toBe(true);
    }
  });
});

describe("scheduled blueprint var fillability — shipped pack sweep", () => {
  const cases = collectScheduledCases();

  it("has scheduled blueprints to check (guard is not vacuous)", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)(
    "$pack/$scheduleId: scheduled blueprint $blueprintId is fireable with defaults only",
    (c) => {
      const bad = scheduledVarsWithoutDefaults(c);
      expect(
        bad,
        `${c.pack}/${c.scheduleId}: scheduled blueprint ${c.blueprintId} ` +
          `has required var(s) ${bad.join(", ")} with no default. Scheduled ` +
          `blueprints run without human input, so give each a default or make ` +
          `it optional.`
      ).toEqual([]);
    }
  );

  it("covers the CRM lead-list hygiene schedule used by the Marketing bundle", () => {
    const ids = new Set(cases.map((c) => `${c.pack}/${c.scheduleId}`));
    expect(ids.has("relay-crm/lead-poller")).toBe(true);
  });
});

describe("install-time guard refuses an unfillable row-insert pack", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "row-fill-guard-"));
    vi.resetModules();
    vi.stubEnv("RELAY_DATA_DIR", dataDir);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  /** Build a minimal free pack on disk with a row-insert blueprint whose
   *  required var is (un)fillable, and return its dir. */
  function writeSyntheticPack(opts: { fillable: boolean }): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "synthetic-pack-"));
    const base = path.join(dir, "base");
    fs.mkdirSync(path.join(base, "blueprints"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "pack.yaml"),
      yaml.dump({
        id: "synthetic-guard",
        version: "0.1.0",
        name: "Synthetic Guard",
        author: "test",
        description: "x".repeat(120),
        relayCore: ">=0.18.0",
        icon: "megaphone",
      })
    );
    fs.writeFileSync(
      path.join(base, "manifest.yaml"),
      yaml.dump({
        id: "synthetic-guard",
        name: "Synthetic Guard",
        tables: [{ id: "widgets", columns: ["title", "status"] }],
        blueprints: [
          {
            id: "synthetic-guard--on-widget",
            source: "$AINATIVE_DATA_DIR/blueprints/synthetic-guard--on-widget.yaml",
            trigger: { kind: "row-insert", table: "widgets" },
          },
        ],
      })
    );
    fs.writeFileSync(
      path.join(base, "blueprints", "synthetic-guard--on-widget.yaml"),
      yaml.dump({
        id: "synthetic-guard--on-widget",
        name: "On Widget",
        description: "Fires on a new widget row.",
        version: "1.0.0",
        variables: [
          opts.fillable
            ? { id: "widget", type: "text", label: "Widget", required: false, default: "{{row.title}}" }
            : { id: "widget", type: "text", label: "Widget", required: true },
        ],
        steps: [
          {
            name: "Do the thing",
            profileId: "synthetic-guard--worker",
            promptTemplate: "Handle {{widget}}.",
            expectedOutput: "done",
          },
        ],
      })
    );
    return dir;
  }

  it("throws PackValidationError for a required var with no row-default", async () => {
    const { installPack } = await import("../install");
    const { PackValidationError } = await import("../format");
    const packDir = writeSyntheticPack({ fillable: false });
    try {
      await expect(
        installPack(packDir, {
          appsDir: path.join(dataDir, "apps"),
          profilesDir: path.join(dataDir, "profiles"),
          blueprintsDir: path.join(dataDir, "blueprints"),
        })
      ).rejects.toBeInstanceOf(PackValidationError);
    } finally {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  });

  it("accepts the same pack once the required var gets a {{row.col}} default", async () => {
    const { installPack } = await import("../install");
    const packDir = writeSyntheticPack({ fillable: true });
    try {
      const report = await installPack(packDir, {
        appsDir: path.join(dataDir, "apps"),
        profilesDir: path.join(dataDir, "profiles"),
        blueprintsDir: path.join(dataDir, "blueprints"),
      });
      expect(report).toBeDefined();
    } finally {
      fs.rmSync(packDir, { recursive: true, force: true });
    }
  });
});
