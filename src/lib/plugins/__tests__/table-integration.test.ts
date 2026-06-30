// src/lib/plugins/__tests__/table-integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { reloadPlugins } from "../registry";
import { listPluginTableIds, removePluginTables } from "@/lib/data/seed-data/table-templates";

let tmpDir: string;

function writeBundleWithTable(pluginId: string, table: Record<string, unknown>) {
  const root = path.join(tmpDir, "plugins", pluginId);
  fs.mkdirSync(path.join(root, "tables"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "plugin.yaml"),
    yaml.dump({ id: pluginId, version: "0.1.0", apiVersion: "0.14", kind: "primitives-bundle" })
  );
  fs.writeFileSync(path.join(root, "tables", `${(table.id as string)}.yaml`), yaml.dump(table));
}

describe("plugin loader → table integration", () => {
  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-tables-"));
    process.env.RELAY_DATA_DIR = tmpDir;
    removePluginTables("test-pack");
    await reloadPlugins();
  });
  afterEach(async () => {
    delete process.env.RELAY_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    removePluginTables("test-pack");
    await reloadPlugins();
  });

  it("inserts plugin table as a userTableTemplates row with composite id", async () => {
    writeBundleWithTable("test-pack", {
      id: "transactions",
      name: "Transactions",
      description: "tx",
      category: "finance",
      icon: "DollarSign",
      columns: [{ name: "date", displayName: "Date", dataType: "date" }],
    });
    const [plugin] = await reloadPlugins();
    expect(plugin.tables).toEqual(["plugin:test-pack:transactions"]);
    expect(listPluginTableIds("test-pack")).toEqual(["plugin:test-pack:transactions"]);
  });

  it("removes plugin table rows on reload after directory removed", async () => {
    writeBundleWithTable("test-pack", {
      id: "transactions", name: "T", description: "x", category: "finance", icon: "DollarSign",
      columns: [{ name: "x", displayName: "X", dataType: "text" }],
    });
    await reloadPlugins();
    expect(listPluginTableIds("test-pack").length).toBe(1);

    fs.rmSync(path.join(tmpDir, "plugins", "test-pack"), { recursive: true, force: true });
    await reloadPlugins();
    expect(listPluginTableIds("test-pack")).toEqual([]);
  });
});
