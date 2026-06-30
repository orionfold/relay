import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { getAinativeAppsDir } from "@/lib/utils/ainative-paths";
import { parseAppManifest } from "../registry";

/**
 * Golden-master test for backward compatibility of `AppManifestSchema` after
 * the strict `view:` field was added in Phase 1.2 (composed-app-manifest-view-field).
 *
 * Strategy:
 *   1. Hand-rolled snapshot fixtures cover the canonical manifest shapes that
 *      have shipped (habit-tracker, plus minimal/empty variants). These run on
 *      every machine including CI.
 *   2. If `~/.ainative/apps/` exists locally, every manifest there must also
 *      parse — this catches drift on the dogfood instance.
 */

const SNAPSHOT_MANIFESTS: { name: string; yaml: string }[] = [
  {
    name: "habit-tracker (real installed shape)",
    yaml: `id: habit-tracker
version: 0.1.0
name: Habit Tracker
description: 'Composed app: Habit Tracker'
profiles:
  - id: habit-tracker--habit-coach
    source: $RELAY_DATA_DIR/profiles/habit-tracker--habit-coach/
blueprints:
  - id: habit-tracker--weekly-review
    source: $RELAY_DATA_DIR/blueprints/habit-tracker--weekly-review.yaml
tables:
  - id: a41a40e2-f028-47ae-b27c-fde2562cdd9d
    columns:
      - habit
      - category
      - frequency
      - current_streak
      - best_streak
      - start_date
      - active
  - id: 87645f0d-0f53-45ff-b6a3-0e678c323d6d
    columns:
      - date
      - habit
      - completed
      - difficulty
      - notes
      - mood
schedules:
  - id: 49010bc2-4b0b-4d54-8ef8-e50a455bd9f0
    cron: 0 20 * * *
    runs: profile:habit-tracker--habit-coach
`,
  },
  {
    name: "minimal manifest (id + name only)",
    yaml: `id: minimal\nname: Minimal\n`,
  },
  {
    name: "manifest with permissions block",
    yaml: `id: m
name: M
permissions:
  preset: read-only
`,
  },
  {
    name: "manifest with explicit view declaration",
    yaml: `id: with-view
name: With View
view:
  kit: tracker
  bindings:
    hero:
      table: t1
    cadence:
      schedule: s1
profiles: []
blueprints: []
tables:
  - id: t1
schedules:
  - id: s1
`,
  },
];

describe("Golden-master: existing manifest shapes still parse after view: field added", () => {
  for (const fixture of SNAPSHOT_MANIFESTS) {
    it(`parses: ${fixture.name}`, () => {
      const m = parseAppManifest(fixture.yaml);
      expect(m).not.toBeNull();
    });
  }
});

describe("Golden-master: every installed app on this machine parses", () => {
  const appsDir = getAinativeAppsDir();
  const exists = fs.existsSync(appsDir);

  if (!exists) {
    it.skip("(no ~/.ainative/apps/ directory present — skipping live scan)", () => {});
    return;
  }

  const manifestPaths: string[] = [];
  for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const p = path.join(appsDir, entry.name, "manifest.yaml");
    if (fs.existsSync(p)) manifestPaths.push(p);
  }

  if (manifestPaths.length === 0) {
    it.skip("(no installed apps under ~/.ainative/apps/ — skipping live scan)", () => {});
    return;
  }

  for (const p of manifestPaths) {
    it(`parses: ${path.relative(appsDir, p)}`, () => {
      const text = fs.readFileSync(p, "utf-8");
      const m = parseAppManifest(text);
      expect(m).not.toBeNull();
    });
  }
});
