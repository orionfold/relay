/** @vitest-environment node */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import pkg from "../../../../package.json";
import {
  KNOWLEDGE_MAX_SECTIONS,
  KNOWLEDGE_MAX_TOKENS,
  isRelayKnowledgeHelpIntent,
  prepareRelayKnowledgeTurn,
  rankKnowledgeIndex,
} from "../chat-retrieval";
import type { RelayKnowledgeIndex } from "../types";

const ROOT = resolve(process.cwd());
const tempRoots: string[] = [];

function stableJson(value: unknown): string {
  const sort = (child: unknown): unknown => {
    if (Array.isArray(child)) return child.map(sort);
    if (child && typeof child === "object") {
      return Object.fromEntries(
        Object.entries(child as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, sort(nested)])
      );
    }
    return child;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "relay-knowledge-chat-"));
  tempRoots.push(root);
  cpSync(join(ROOT, "knowledge"), join(root, "knowledge"), { recursive: true });
  cpSync(join(ROOT, "package.json"), join(root, "package.json"));
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Relay knowledge help intent", () => {
  it.each([
    "How do I publish a Pack?",
    "Where do I configure the Ollama runtime?",
    "What does POST /api/packs/install do?",
    "Explain Relay Tables",
  ])("recognizes bounded product-help intent: %s", (query) => {
    expect(isRelayKnowledgeHelpIntent(query)).toBe(true);
  });

  it.each([
    "publish my Pack",
    "create a workflow",
    "My workflow failed yesterday",
    "scaffold a plugin for Salesforce",
    "hello Relay",
    "What is the weather today?",
  ])("does not intercept action/support turns: %s", (query) => {
    expect(isRelayKnowledgeHelpIntent(query)).toBe(false);
  });
});

describe("Relay knowledge ranking and retrieval", () => {
  it.each([
    "How do I publish a Pack?",
    "Where do I configure the Ollama runtime?",
    "How does Relay isolate customers?",
    "Show me how Relay Tables work",
    "What does POST /api/packs/install do?",
  ])("finds a current packaged section for a release-critical help journey: %s", (query) => {
    const turn = prepareRelayKnowledgeTurn(query, { rootDir: ROOT });
    expect(turn.status).toBe("ready");
    if (turn.status === "ready") {
      expect(turn.receipt.releaseVersion).toBe(pkg.version);
      expect(turn.receipt.sections.length).toBeGreaterThan(0);
    }
  });

  it("ranks an exact API endpoint deterministically ahead of group records", () => {
    const index = JSON.parse(readFileSync(join(ROOT, "knowledge/index.json"), "utf8")) as RelayKnowledgeIndex;
    const first = rankKnowledgeIndex(index, "What does POST /api/packs/install do?")[0];
    const second = rankKnowledgeIndex(index, "What does POST /api/packs/install do?")[0];
    expect(first).toEqual(second);
    expect(first.sourceId).toBe("api:05-packs-apps-tables-publishing");
    expect(first.heading).toContain("POST /api/packs/install");
  });

  it("loads bounded current passages and derives only source/action affordances", () => {
    const turn = prepareRelayKnowledgeTurn("Where do I configure the Ollama runtime?", { rootDir: ROOT });
    expect(turn.status).toBe("ready");
    if (turn.status !== "ready") return;
    expect(turn.receipt.releaseVersion).toBe(pkg.version);
    expect(turn.receipt.sections.length).toBeGreaterThan(0);
    expect(turn.receipt.sections.length).toBeLessThanOrEqual(KNOWLEDGE_MAX_SECTIONS);
    expect(turn.prompt).toContain("Verified current Relay knowledge");
    const passageStart = turn.prompt.indexOf("### Source 1:");
    expect(Math.ceil(turn.prompt.slice(passageStart).length / 4)).toBeLessThanOrEqual(
      KNOWLEDGE_MAX_TOKENS + 150
    );
    expect(turn.quickAccess.some((item) => item.kind === "knowledge-source")).toBe(true);
    expect(
      turn.quickAccess
        .filter((item) => item.kind === "knowledge-source")
        .every((item) => item.href?.startsWith("https://orionfold.com/relay/docs/"))
    ).toBe(true);
    expect(
      turn.quickAccess
        .filter((item) => item.kind === "knowledge-action")
        .every((item) => item.href.startsWith("/") && !item.href.startsWith("/api/"))
    ).toBe(true);
    expect(turn.quickAccess).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "knowledge-action",
        href: "/settings#settings-providers",
        label: "Open Providers & runtimes settings",
      }),
    ]));
  });

  it("does not touch the bundle for non-help turns", () => {
    const turn = prepareRelayKnowledgeTurn("publish my Pack", { rootDir: "/definitely/missing" });
    expect(turn).toEqual({ status: "not-requested" });
  });
});

describe("Relay knowledge named unavailable states", () => {
  it("names a missing bundle without stale fallback", () => {
    const root = mkdtempSync(join(tmpdir(), "relay-knowledge-missing-"));
    tempRoots.push(root);
    cpSync(join(ROOT, "package.json"), join(root, "package.json"));
    const turn = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: root });
    expect(turn.status).toBe("unavailable");
    if (turn.status === "unavailable") {
      expect(turn.receipt.failureCode).toBe("KnowledgeBundleMissingError");
      expect(turn.response).toContain("won’t substitute stale or unverified guidance");
    }
  });

  it("rejects a stale release version", () => {
    const root = fixtureRoot();
    const pkgPath = join(root, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    pkg.version = "9.9.9";
    writeFileSync(pkgPath, JSON.stringify(pkg));
    const turn = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: root });
    expect(turn.status === "unavailable" && turn.receipt.failureCode).toBe("KnowledgeBundleVersionError");
  });

  it("rejects a tampered index", () => {
    const root = fixtureRoot();
    const indexPath = join(root, "knowledge/index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf8"));
    index.sections[0].heading = "Tampered";
    writeFileSync(indexPath, JSON.stringify(index));
    const turn = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: root });
    expect(turn.status === "unavailable" && turn.receipt.failureCode).toBe("KnowledgeBundleIntegrityError");
  });

  it("rejects malformed JSON and unknown schemas", () => {
    const malformedRoot = fixtureRoot();
    writeFileSync(join(malformedRoot, "knowledge/index.json"), "{");
    const malformed = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: malformedRoot });
    expect(malformed.status === "unavailable" && malformed.receipt.failureCode).toBe("KnowledgeBundleSchemaError");

    const unknownRoot = fixtureRoot();
    const manifestPath = join(unknownRoot, "knowledge/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.schemaVersion = 999;
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const unknown = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: unknownRoot });
    expect(unknown.status === "unavailable" && unknown.receipt.failureCode).toBe("KnowledgeBundleSchemaError");
  });

  it.each(["https://example.com/trap", "/settings#runtime"])(
    "rejects an unsafe or stale product route even when the artifact hashes are self-consistent: %s",
    (unsafeRoute) => {
      const root = fixtureRoot();
      const indexPath = join(root, "knowledge/index.json");
      const manifestPath = join(root, "knowledge/manifest.json");
      const index = JSON.parse(readFileSync(indexPath, "utf8"));
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      index.sections[0].productRoutes = [unsafeRoute];
      const indexJson = stableJson(index);
      manifest.indexHash = sha256(indexJson);
      manifest.bundleHash = sha256(stableJson({
        corpus: manifest.corpus,
        entries: manifest.entries.map(({
          contentHash,
          id,
          path,
          publicUrl,
        }: Record<string, string>) => ({ contentHash, id, path, publicUrl })),
        indexHash: manifest.indexHash,
        releaseVersion: manifest.releaseVersion,
        sourceBundleHash: manifest.sourceBundleHash,
      }));
      writeFileSync(indexPath, indexJson);
      writeFileSync(manifestPath, stableJson(manifest));
      const turn = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: root });
      expect(turn.status === "unavailable" && turn.receipt.failureCode).toBe("KnowledgeBundleSchemaError");
    },
  );

  it.each([
    "https://example.com/relay/docs/get-started-with-relay/",
    "http://orionfold.com/relay/docs/get-started-with-relay/",
    "https://orionfold.com/relay/api/01-overview-local-api/",
    "https://orionfold.com/relay/docs/get-started-with-relay/?next=trap",
  ])("rejects an unsafe or noncanonical source destination: %s", (publicUrl) => {
    const root = fixtureRoot();
    const manifestPath = join(root, "knowledge/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const guide = manifest.entries.find((entry: { kind: string }) => entry.kind === "guide");
    guide.publicUrl = publicUrl;
    writeFileSync(manifestPath, stableJson(manifest));
    const turn = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: root });
    expect(turn.status === "unavailable" && turn.receipt.failureCode).toBe("KnowledgeBundleSchemaError");
  });

  it("rejects a manifest source whose kind does not match its id or URL family", () => {
    const root = fixtureRoot();
    const manifestPath = join(root, "knowledge/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const guide = manifest.entries.find((entry: { kind: string }) => entry.kind === "guide");
    guide.kind = "api";
    writeFileSync(manifestPath, stableJson(manifest));
    const turn = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: root });
    expect(turn.status === "unavailable" && turn.receipt.failureCode).toBe("KnowledgeBundleSchemaError");
  });

  it("rejects an oversized index before parsing", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "knowledge/index.json"), " ".repeat(2 * 1024 * 1024 + 1));
    const turn = prepareRelayKnowledgeTurn("How do I use Relay?", { rootDir: root });
    expect(turn.status === "unavailable" && turn.receipt.failureCode).toBe("KnowledgeBundleSizeError");
  });
});
