import { describe, it, expect } from "vitest";
import { packOf, type PackablePrimitive } from "../pack-of";

// The installed-pack set the resolver gates against. In production this is
// `listApps().map(a => a.id)`; here it is fixed so the resolver stays pure.
// Post persona/industry split there are four bundled packs: the free persona
// pack, its paid automation tier, and the two paid industry packs.
const INSTALLED = new Set([
  "relay-agency",
  "relay-agency-pro",
  "relay-cre",
  "relay-nonprofit",
]);

describe("packOf — file-based kinds (profiles, blueprints) via the `--` id prefix", () => {
  it("attributes a profile whose id carries an installed pack's prefix", () => {
    const p: PackablePrimitive = {
      kind: "profile",
      id: "relay-agency--account-manager",
    };
    expect(packOf(p, INSTALLED)).toBe("relay-agency");
  });

  it("attributes an industry-pack profile to its own pack, not the persona pack", () => {
    // After the split, CRE delivery lives in relay-cre; its prefix must
    // resolve to relay-cre even though relay-agency is also installed.
    const p: PackablePrimitive = {
      kind: "profile",
      id: "relay-cre--cre-analyst",
    };
    expect(packOf(p, INSTALLED)).toBe("relay-cre");
  });

  it("attributes a blueprint whose id carries an installed pack's prefix", () => {
    const p: PackablePrimitive = {
      kind: "blueprint",
      id: "relay-agency-pro--deal-memo",
    };
    expect(packOf(p, INSTALLED)).toBe("relay-agency-pro");
  });

  it("returns null for a hand-authored `foo--bar` id whose prefix is NOT an installed pack", () => {
    // The core invariant: a `--` id alone must not be mis-attributed to a pack
    // that was never installed. Otherwise a user's own `my-notes--triage`
    // profile would falsely wear a pack pill.
    const p: PackablePrimitive = { kind: "profile", id: "my-notes--triage" };
    expect(packOf(p, INSTALLED)).toBeNull();
  });

  it("returns null for a plain profile id with no `--` separator", () => {
    const p: PackablePrimitive = { kind: "profile", id: "researcher" };
    expect(packOf(p, INSTALLED)).toBeNull();
  });

  it("does not treat a leading `--` (empty prefix) as a pack", () => {
    const p: PackablePrimitive = { kind: "blueprint", id: "--orphan" };
    expect(packOf(p, INSTALLED)).toBeNull();
  });
});

describe("packOf — DB kinds (tables) via projectId", () => {
  it("attributes a table whose projectId is an installed pack id", () => {
    const p: PackablePrimitive = {
      kind: "table",
      id: "3f1c-uuid",
      projectId: "relay-agency",
    };
    expect(packOf(p, INSTALLED)).toBe("relay-agency");
  });

  it("returns null for a user-created table whose projectId is a normal project", () => {
    const p: PackablePrimitive = {
      kind: "table",
      id: "9a2b-uuid",
      projectId: "my-crm-project",
    };
    expect(packOf(p, INSTALLED)).toBeNull();
  });

  it("returns null for a table with no projectId", () => {
    const p: PackablePrimitive = { kind: "table", id: "loose-uuid" };
    expect(packOf(p, INSTALLED)).toBeNull();
  });
});

describe("packOf — schedules prefer the composite id, fall back to projectId", () => {
  it("recovers the pack from the `app:<packId>:<sid>` composite id", () => {
    const p: PackablePrimitive = {
      kind: "schedule",
      id: "app:relay-agency:nightly-sweep",
    };
    expect(packOf(p, INSTALLED)).toBe("relay-agency");
  });

  it("falls back to projectId when the id is not an app-schedule composite", () => {
    const p: PackablePrimitive = {
      kind: "schedule",
      id: "legacy-uuid",
      projectId: "relay-agency-pro",
    };
    expect(packOf(p, INSTALLED)).toBe("relay-agency-pro");
  });

  it("returns null when neither the composite id nor projectId names an installed pack", () => {
    const p: PackablePrimitive = {
      kind: "schedule",
      id: "app:some-uninstalled-app:x",
      projectId: "some-uninstalled-app",
    };
    expect(packOf(p, INSTALLED)).toBeNull();
  });

  it("prefers the composite-id pack over projectId when they disagree (composite is authoritative)", () => {
    // A user who re-parented the schedule to another project keeps the pack
    // provenance the composite id encodes.
    const p: PackablePrimitive = {
      kind: "schedule",
      id: "app:relay-agency:x",
      projectId: "relay-agency-pro",
    };
    expect(packOf(p, INSTALLED)).toBe("relay-agency");
  });
});

describe("packOf — empty installed set", () => {
  it("attributes nothing when no packs are installed", () => {
    const empty = new Set<string>();
    expect(
      packOf({ kind: "profile", id: "relay-agency--x" }, empty)
    ).toBeNull();
    expect(
      packOf({ kind: "table", id: "u", projectId: "relay-agency" }, empty)
    ).toBeNull();
  });
});
