import { describe, expect, it } from "vitest";
import {
  checkPackCompat,
  runCheck,
  snapshotPack,
} from "../../../../scripts/check-pack-compat.mjs";

function snap(opts: {
  id?: string;
  relayCore?: string;
  manifest: string;
}) {
  const id = opts.id ?? "relay-demo";
  return snapshotPack({
    id,
    packYaml: `id: ${id}\nversion: "0.1.0"\nname: Demo\nrelayCore: "${opts.relayCore ?? ">=0.35.0"}"\n`,
    manifestYaml: opts.manifest,
  });
}

function one(before: ReturnType<typeof snap>, after: ReturnType<typeof snap>) {
  return checkPackCompat({ [before.id]: before }, { [after.id]: after });
}

describe("checkPackCompat", () => {
  it("allows additive tables, columns, blueprints, schedules, and view refs", () => {
    const before = snap({
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name]
blueprints:
  - id: draft
schedules:
  - id: weekly
view:
  bindings:
    hero:
      table: leads
`,
    });
    const after = snap({
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name, email]
  - id: campaigns
    columns: [title]
blueprints:
  - id: draft
  - id: enrich
schedules:
  - id: weekly
  - id: daily
view:
  bindings:
    hero:
      table: leads
    secondary:
      - blueprint: draft
      - table: campaigns
`,
    });
    expect(one(before, after).findings).toEqual([]);
  });

  it("flags removed table columns as breaking", () => {
    const before = snap({
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name, email]
`,
    });
    const after = snap({
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name]
`,
    });
    const result = one(before, after);
    expect(result.findings).toEqual([
      'breaking column removal: "relay-demo" table "leads" no longer declares column "email"',
    ]);
  });

  it("flags removed primitives as breaking", () => {
    const before = snap({
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name]
blueprints:
  - id: draft
schedules:
  - id: weekly
`,
    });
    const after = snap({
      manifest: `
id: relay-demo
name: Demo
tables: []
blueprints: []
schedules: []
`,
    });
    const result = one(before, after);
    expect(result.findings).toEqual([
      'breaking table removal: "relay-demo" no longer declares table "leads"',
      'breaking blueprint removal: "relay-demo" no longer declares blueprint "draft"',
      'breaking schedule removal: "relay-demo" no longer declares schedule "weekly"',
    ]);
  });

  it("flags row-insert trigger removal or retargeting as breaking", () => {
    const before = snap({
      manifest: `
id: relay-demo
name: Demo
blueprints:
  - id: draft
    trigger:
      kind: row-insert
      table: leads
`,
    });
    const after = snap({
      manifest: `
id: relay-demo
name: Demo
blueprints:
  - id: draft
`,
    });
    expect(one(before, after).findings).toEqual([
      'breaking trigger change: "relay-demo" blueprint "draft" changed its trigger',
    ]);
  });

  it("flags existing view bindings removed from still-present primitives", () => {
    const before = snap({
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name]
view:
  bindings:
    hero:
      table: leads
`,
    });
    const after = snap({
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name]
view:
  bindings: {}
`,
    });
    expect(one(before, after).findings).toEqual([
      'breaking view binding removal: "relay-demo" no longer exposes table "leads" in view.bindings',
    ]);
  });

  it("allows breaking changes when relayCore major is raised", () => {
    const before = snap({
      relayCore: ">=0.35.0",
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name, email]
`,
    });
    const after = snap({
      relayCore: ">=1.0.0",
      manifest: `
id: relay-demo
name: Demo
tables:
  - id: leads
    columns: [name]
`,
    });
    const result = one(before, after);
    expect(result.findings).toEqual([]);
    expect(result.allowed[0]).toMatch(/allowed because relayCore major changed/);
  });

  it("flags a removed pack as breaking", () => {
    const before = snap({ manifest: "id: relay-demo\nname: Demo\n" });
    const result = checkPackCompat({ [before.id]: before }, {});
    expect(result.findings).toEqual([
      'removed pack "relay-demo" — pack removal is breaking for installed customers',
    ]);
  });
});

describe("the real pack templates pass the compat gate", () => {
  it("runCheck against the default baseline is clean", () => {
    const result = runCheck();
    expect(result.findings).toEqual([]);
    expect(result.candidatePackCount).toBeGreaterThan(0);
  });
});
