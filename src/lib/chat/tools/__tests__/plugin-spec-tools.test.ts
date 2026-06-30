import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as yaml from "js-yaml";

describe("plugin-spec-tools — scaffoldPluginSpec + create_plugin_spec chat tool", () => {
  let tmpDataDir: string;
  let originalDataDir: string | undefined;

  beforeEach(() => {
    originalDataDir = process.env.RELAY_DATA_DIR;
    tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ainative-plugin-spec-test-"));
    process.env.RELAY_DATA_DIR = tmpDataDir;
    fs.mkdirSync(path.join(tmpDataDir, "plugins"), { recursive: true });
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env.RELAY_DATA_DIR;
    else process.env.RELAY_DATA_DIR = originalDataDir;
    fs.rmSync(tmpDataDir, { recursive: true, force: true });
  });

  const validInput = {
    id: "github-mine",
    name: "GitHub Mine",
    description: "Pulls GitHub issues assigned to me.",
    capabilities: [] as string[],
    transport: "stdio" as const,
    language: "python" as const,
    tools: [
      { name: "list_my_issues", description: "List my assigned GitHub issues." },
    ],
  };

  it("scaffolds all 4 files at ~/.ainative/plugins/<id>/", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    const result = scaffoldPluginSpec(validInput);
    expect(result.ok).toBe(true);
    expect(result.id).toBe("github-mine");
    expect(result.pluginDir).toBe(path.join(tmpDataDir, "plugins", "github-mine"));
    expect(fs.existsSync(path.join(result.pluginDir, "plugin.yaml"))).toBe(true);
    expect(fs.existsSync(path.join(result.pluginDir, ".mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(result.pluginDir, "server.py"))).toBe(true);
    expect(fs.existsSync(path.join(result.pluginDir, "README.md"))).toBe(true);
    expect(result.tools).toEqual(["list_my_issues"]);
    expect(result.message).toContain("Reload");
  });

  it("writes plugin.yaml with author: ainative AND origin: ainative-internal (belt-and-suspenders)", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    const result = scaffoldPluginSpec(validInput);
    const yamlText = fs.readFileSync(result.files.pluginYaml, "utf-8");
    expect(yamlText).toMatch(/^author: ainative$/m);
    expect(yamlText).toMatch(/^origin: ainative-internal$/m);
    expect(yamlText).toContain("id: github-mine");
    expect(yamlText).toContain('apiVersion: "0.14"');
    expect(yamlText).toContain("kind: chat-tools");
  });

  it("writes .mcp.json with stdio+python config referencing ${PLUGIN_DIR}/server.py", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    const result = scaffoldPluginSpec(validInput);
    const mcp = JSON.parse(fs.readFileSync(result.files.mcpJson, "utf-8"));
    expect(mcp.mcpServers["github-mine"].command).toBe("python3");
    expect(mcp.mcpServers["github-mine"].args).toEqual(["${PLUGIN_DIR}/server.py"]);
    expect(mcp.mcpServers["github-mine"].transport).toBe("stdio");
  });

  it("writes server.py with a handler stub per declared tool", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    const result = scaffoldPluginSpec({
      ...validInput,
      tools: [
        { name: "list_my_issues", description: "List my issues." },
        { name: "close_issue", description: "Close a single issue." },
      ],
    });
    const server = fs.readFileSync(result.files.serverPy, "utf-8");
    expect(server).toContain('"name": "list_my_issues"');
    expect(server).toContain('"name": "close_issue"');
    expect(server).toContain("_TOOL_NAMES");
    expect(server).toContain("#!/usr/bin/env python3");
    expect(server).toContain("PROTOCOL_VERSION");
    expect(server).toMatch(/^import json$/m);
    expect(server).toMatch(/^import sys$/m);
  });

  it("writes README.md referencing the echo-server reference and origin contract", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    const result = scaffoldPluginSpec(validInput);
    const readme = fs.readFileSync(result.files.readme, "utf-8");
    expect(readme).toContain("echo-server");
    expect(readme).toContain("origin: ainative-internal");
    expect(readme.length).toBeGreaterThan(100);
  });

  it("refuses to overwrite existing plugin dir", async () => {
    const { scaffoldPluginSpec, PluginSpecAlreadyExistsError } = await import(
      "@/lib/chat/tools/plugin-spec-tools"
    );
    fs.mkdirSync(path.join(tmpDataDir, "plugins", "github-mine"));
    expect(() => scaffoldPluginSpec(validInput)).toThrow(PluginSpecAlreadyExistsError);
  });

  it("rejects invalid id (uppercase)", async () => {
    const { scaffoldPluginSpec, PluginSpecInvalidIdError } = await import(
      "@/lib/chat/tools/plugin-spec-tools"
    );
    expect(() => scaffoldPluginSpec({ ...validInput, id: "GitHubMine" })).toThrow(
      PluginSpecInvalidIdError
    );
  });

  it("rejects invalid id (leading digit)", async () => {
    const { scaffoldPluginSpec, PluginSpecInvalidIdError } = await import(
      "@/lib/chat/tools/plugin-spec-tools"
    );
    expect(() => scaffoldPluginSpec({ ...validInput, id: "1github" })).toThrow(
      PluginSpecInvalidIdError
    );
  });

  it("rejects reserved id 'echo-server'", async () => {
    const { scaffoldPluginSpec, PluginSpecInvalidIdError } = await import(
      "@/lib/chat/tools/plugin-spec-tools"
    );
    expect(() => scaffoldPluginSpec({ ...validInput, id: "echo-server" })).toThrow(
      PluginSpecInvalidIdError
    );
  });

  it("writes TODO-stub for node+inprocess (v1 doesn't scaffold real bodies)", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    const result = scaffoldPluginSpec({
      ...validInput,
      language: "node",
      transport: "inprocess",
    });
    const server = fs.readFileSync(result.files.serverPy, "utf-8");
    expect(server).toContain("TODO");
    expect(server).toContain("Phase 6.5");
    const mcp = JSON.parse(fs.readFileSync(result.files.mcpJson, "utf-8"));
    expect(mcp.mcpServers[validInput.id]._todo).toContain("Phase 6.5");
  });

  it("integrates with TDR-037 classifier — scaffolded plugin routes to 'self'", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    const { classifyPluginTrust } = await import("@/lib/plugins/classify-trust");
    const result = scaffoldPluginSpec(validInput);
    const manifestText = fs.readFileSync(result.files.pluginYaml, "utf-8");
    const manifest = yaml.load(manifestText) as Record<string, unknown>;
    const trust = classifyPluginTrust(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      manifest as any,
      result.pluginDir,
      {
        userIdentity: "someone-else-entirely",
        appsBaseDir: path.join(tmpDataDir, "apps"),
      }
    );
    expect(trust).toBe("self");
  });

  it("cleans up temp dir when a write fails mid-scaffold", async () => {
    const { scaffoldPluginSpec, PluginSpecWriteError } = await import(
      "@/lib/chat/tools/plugin-spec-tools"
    );
    fs.rmSync(path.join(tmpDataDir, "plugins"), { recursive: true });
    fs.writeFileSync(path.join(tmpDataDir, "plugins"), "I am a file, not a dir");
    expect(() => scaffoldPluginSpec(validInput)).toThrow(PluginSpecWriteError);
    expect(fs.existsSync(path.join(tmpDataDir, "plugins", "github-mine"))).toBe(false);
  });

  it("is exposed as 'create_plugin_spec' chat tool and returns ok on happy path", async () => {
    const { pluginSpecTools } = await import("@/lib/chat/tools/plugin-spec-tools");
    const tools = pluginSpecTools({});
    expect(tools).toHaveLength(1);
    const tool = tools[0];
    expect(tool.name).toBe("create_plugin_spec");
    const result = await tool.handler(validInput);
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.id).toBe("github-mine");
    expect(parsed.tools).toEqual(["list_my_issues"]);
  });

  it("renders valid Python set for empty tools list (defensive against non-Zod callers)", async () => {
    const { scaffoldPluginSpec } = await import("@/lib/chat/tools/plugin-spec-tools");
    // scaffoldPluginSpec is exported separately from the Zod-validated chat tool,
    // so an empty tools array is reachable via direct function calls. The Python
    // template must produce a valid set() literal, not `{  }` (which is an empty dict).
    const result = scaffoldPluginSpec({ ...validInput, tools: [] });
    const server = fs.readFileSync(result.files.serverPy, "utf-8");
    expect(server).toContain("_TOOL_NAMES = set()");
    expect(server).not.toMatch(/_TOOL_NAMES\s*=\s*\{\s*\}/);
  });

  it("chat tool returns isError: true with named error when id is invalid", async () => {
    const { pluginSpecTools } = await import("@/lib/chat/tools/plugin-spec-tools");
    const tool = pluginSpecTools({})[0];
    const result = await tool.handler({ ...validInput, id: "BadId" });
    expect((result as { isError?: boolean }).isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain("PluginSpecInvalidIdError");
  });
});
