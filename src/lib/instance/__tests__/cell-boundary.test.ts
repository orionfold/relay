import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildRelayCellBoundary,
  buildRelayExecutionContext,
} from "../cell-boundary";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeCell(label: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `relay-${label}-`));
  roots.push(root);
  return buildRelayCellBoundary({
    instanceId: `cell-${label}`,
    dataDirectory: root,
    databasePath: path.join(root, "relay.db"),
    launchWorkingDirectory: path.join(root, "workspace"),
    dataDirectorySource: "override",
  });
}

describe("Relay cell boundary", () => {
  it("normalizes content-safe facts and preserves an unavailable instance id", () => {
    const boundary = buildRelayCellBoundary({
      instanceId: null,
      dataDirectory: "./relative-cell",
      databasePath: "./relative-cell/relay.db",
      launchWorkingDirectory: "./workspace",
      dataDirectorySource: "default",
    });

    expect(boundary).toEqual({
      vocabularyVersion: "relay-host-cell-v1",
      instanceId: null,
      dataDirectory: path.resolve("./relative-cell"),
      databasePath: path.resolve("./relative-cell/relay.db"),
      launchWorkingDirectory: path.resolve("./workspace"),
      dataDirectorySource: "default",
    });
    expect(Object.keys(boundary).sort()).toEqual([
      "dataDirectory",
      "dataDirectorySource",
      "databasePath",
      "instanceId",
      "launchWorkingDirectory",
      "vocabularyVersion",
    ]);
  });

  it("uses a project directory when present and the launch workspace otherwise", () => {
    const cell = makeCell("context");
    const explicit = buildRelayExecutionContext({
      cell,
      project: { id: "project-a", name: "A", workingDirectory: "/srv/a" },
    });
    const fallback = buildRelayExecutionContext({
      cell,
      project: { id: "project-b", name: "B", workingDirectory: null },
    });

    expect(explicit.workingDirectory).toBe("/srv/a");
    expect(explicit.workingDirectorySource).toBe("project");
    expect(fallback.workingDirectory).toBe(cell.launchWorkingDirectory);
    expect(fallback.workingDirectorySource).toBe("launch");
    expect(explicit.cell).toEqual(fallback.cell);
    expect(Object.keys(explicit.cell).sort()).toEqual([
      "instanceId",
      "vocabularyVersion",
    ]);
  });

  it("keeps synthetic cell databases, files, secrets, logs, licenses, and backups distinct", () => {
    const cellA = makeCell("a");
    const cellB = makeCell("b");
    const relativeArtifacts = [
      "relay.db",
      "documents/customer.txt",
      ".keyfile",
      "logs/runtime.log",
      "license/license.json",
      "backups/latest.json",
    ];

    for (const [cell, marker] of [[cellA, "A"], [cellB, "B"]] as const) {
      for (const artifact of relativeArtifacts) {
        const target = path.join(cell.dataDirectory, artifact);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, marker);
      }
    }

    expect(cellA.dataDirectory).not.toBe(cellB.dataDirectory);
    expect(cellA.databasePath).not.toBe(cellB.databasePath);
    for (const artifact of relativeArtifacts) {
      expect(fs.readFileSync(path.join(cellA.dataDirectory, artifact), "utf8")).toBe("A");
      expect(fs.readFileSync(path.join(cellB.dataDirectory, artifact), "utf8")).toBe("B");
    }
  });
});
