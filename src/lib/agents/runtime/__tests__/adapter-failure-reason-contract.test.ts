import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adapterPaths = [
  "src/lib/agents/runtime/ollama-adapter.ts",
  "src/lib/agents/runtime/openai-direct.ts",
  "src/lib/agents/runtime/anthropic-direct.ts",
  "src/lib/agents/runtime/openai-compatible-adapter.ts",
] as const;

describe("non-Claude task failure reason contract", () => {
  it.each(adapterPaths)(
    "%s persists the shared machine-readable failure classification",
    (path) => {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("classifyTaskFailureReason");
      expect(source).toMatch(
        /failureReason:\s*(?:cancelled\s*\?[^:]+:\s*)?classifyTaskFailureReason\(/,
      );
    },
  );

  it("passes the executing runtime into every shared context-builder call", () => {
    const expectedRuntimeByPath = new Map<string, string>([
      ["src/lib/agents/runtime/ollama-adapter.ts", '"ollama"'],
      ["src/lib/agents/runtime/openai-direct.ts", '"openai-direct"'],
      ["src/lib/agents/runtime/anthropic-direct.ts", '"anthropic-direct"'],
      ["src/lib/agents/runtime/openai-compatible-adapter.ts", "runtimeId"],
    ]);

    for (const [path, runtime] of expectedRuntimeByPath) {
      const source = readFileSync(path, "utf8");
      const call = source.match(/buildTaskQueryContext\([\s\S]*?\)/)?.[0];
      expect(call, path).toContain(runtime);
    }
  });
});
