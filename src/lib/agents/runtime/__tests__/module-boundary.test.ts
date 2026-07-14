/** @vitest-environment node */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const agentsRoot = resolve(process.cwd(), "src/lib/agents");
const ainativeToolsPath = resolve(
  process.cwd(),
  "src/lib/chat/ainative-tools"
);

function productionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.name === "__tests__" || entry.isSymbolicLink()) return [];
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    return entry.isFile() && /\.tsx?$/.test(path) ? [path] : [];
  });
}

function staticModuleSpecifiers(source: string): string[] {
  const sourceFile = ts.createSourceFile(
    "module.ts",
    source,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS
  );
  const specifiers: string[] = [];
  for (const statement of sourceFile.statements) {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteralLike(statement.moduleSpecifier)
    ) {
      specifiers.push(statement.moduleSpecifier.text);
      continue;
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression &&
      ts.isStringLiteralLike(statement.moduleReference.expression)
    ) {
      specifiers.push(statement.moduleReference.expression.text);
    }
  }
  return specifiers;
}

function withoutTypeScriptExtension(path: string): string {
  return /\.(?:[cm]?[jt]sx?)$/.test(extname(path))
    ? path.slice(0, -extname(path).length)
    : path;
}

function resolvesToAinativeTools(importerPath: string, specifier: string) {
  if (specifier.startsWith("@/")) {
    return (
      withoutTypeScriptExtension(
        resolve(process.cwd(), "src", specifier.slice(2))
      ) === ainativeToolsPath
    );
  }
  if (!specifier.startsWith(".")) return false;
  return (
    withoutTypeScriptExtension(resolve(dirname(importerPath), specifier)) ===
    ainativeToolsPath
  );
}

describe("runtime registry module boundary", () => {
  it("identifies every static module syntax while allowing dynamic import()", () => {
    expect(
      staticModuleSpecifiers(`
        import value from "@/lib/chat/ainative-tools";
        import "../../chat/ainative-tools";
        import tools = require("../chat/ainative-tools");
        export { value } from "@/lib/chat/ainative-tools.ts";
        export * from "../../chat/ainative-tools";
        const allowed = import("@/lib/chat/ainative-tools");
      `)
    ).toEqual([
      "@/lib/chat/ainative-tools",
      "../../chat/ainative-tools",
      "../chat/ainative-tools",
      "@/lib/chat/ainative-tools.ts",
      "../../chat/ainative-tools",
    ]);
    expect(
      resolvesToAinativeTools(
        resolve(agentsRoot, "runtime/openai-direct.ts"),
        "../../chat/ainative-tools"
      )
    ).toBe(true);
  });

  it("keeps Chat tool-server imports dynamic throughout production agents", () => {
    const violations = productionTypeScriptFiles(agentsRoot).flatMap((path) =>
      staticModuleSpecifiers(readFileSync(path, "utf8"))
        .filter((specifier) => resolvesToAinativeTools(path, specifier))
        .map(
          (specifier) =>
            `${relative(process.cwd(), path)} -> ${JSON.stringify(specifier)}`
        )
    );

    expect(violations).toEqual([]);
  });
});
