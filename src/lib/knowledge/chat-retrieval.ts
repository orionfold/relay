import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { getAppRoot } from "@/lib/utils/app-root";
import {
  RELAY_KNOWLEDGE_SCHEMA_VERSION,
  type RelayKnowledgeEntry,
  type RelayKnowledgeIndex,
  type RelayKnowledgeIndexSection,
  type RelayKnowledgeManifest,
  type RelayKnowledgeSection,
} from "./types";
import { isSafeKnowledgeSourceHref, type QuickAccessItem } from "@/lib/chat/types";

export const KNOWLEDGE_MAX_SECTIONS = 3;
export const KNOWLEDGE_MAX_TOKENS = 1_200;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_INDEX_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024;

export type KnowledgeFailureCode =
  | "KnowledgeBundleMissingError"
  | "KnowledgeBundleVersionError"
  | "KnowledgeBundleSchemaError"
  | "KnowledgeBundleIntegrityError"
  | "KnowledgeBundleSizeError"
  | "KnowledgeNoMatchError";

export class RelayKnowledgeError extends Error {
  constructor(
    public readonly code: KnowledgeFailureCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = code;
  }
}

export interface RelayKnowledgeReceiptSection {
  sourceId: string;
  sectionId: string;
  sourceKind: "guide" | "api";
  title: string;
  heading: string;
  wordCount: number;
  truncated: boolean;
}

export interface RelayKnowledgeReceipt {
  status: "ready" | "unavailable";
  releaseVersion: string;
  failureCode?: KnowledgeFailureCode;
  sections: RelayKnowledgeReceiptSection[];
}

export type RelayKnowledgeTurn =
  | { status: "not-requested" }
  | {
      status: "ready";
      prompt: string;
      receipt: RelayKnowledgeReceipt;
      quickAccess: QuickAccessItem[];
    }
  | {
      status: "unavailable";
      response: string;
      receipt: RelayKnowledgeReceipt;
      quickAccess: [];
    };

interface LoadedSection extends RelayKnowledgeReceiptSection {
  markdown: string;
  publicUrl: string;
  productRoutes: string[];
  score: number;
}

const STOP_TERMS = new Set([
  "a", "an", "and", "are", "can", "do", "does", "for", "from", "how",
  "i", "in", "is", "it", "me", "my", "of", "on", "or", "relay", "the",
  "this", "to", "what", "where", "which", "with", "you", "your",
]);

const HELP_PATTERNS = [
  /\bhow (?:do|does|can|should|would)\b/i,
  /\bhow to\b/i,
  /\bwhere (?:do|can|is|are)\b/i,
  /\bshow me how\b/i,
  /\bwhat (?:is|are|does|do)\b/i,
  /\b(?:explain|documentation|docs|reference|guide)\b/i,
  /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/api\//i,
];

const DIRECT_ACTION_PATTERN = /^\s*(?:please\s+)?(?:create|delete|install|publish|run|start|stop|update|change|set|add|remove|build|scaffold)\b/i;
const RELAY_PRODUCT_SIGNAL_PATTERN =
  /\/api\/|\b(?:relay|packs?|tables?|workflows?|blueprints?|profiles?|runtimes?|settings|ollama|litellm|lm\s*studio|claude|codex|mcp)\b/i;

export function isRelayKnowledgeHelpIntent(input: string): boolean {
  const text = input.normalize("NFKC").trim();
  if (!text || DIRECT_ACTION_PATTERN.test(text)) return false;
  return RELAY_PRODUCT_SIGNAL_PATTERN.test(text) && HELP_PATTERNS.some((pattern) => pattern.test(text));
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, sorted(child)])
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

function tokens(value: string): string[] {
  return [
    ...new Set(
      (value.normalize("NFKD").toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [])
        .filter((term) => term.length > 1 && !STOP_TERMS.has(term))
    ),
  ];
}

function apiPaths(value: string): string[] {
  return [...new Set(value.match(/\/api\/[A-Za-z0-9_{}./*-]+/g) ?? [])];
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RelayKnowledgeError("KnowledgeBundleSchemaError", `${label} must be an object`);
  }
}

function readJson(file: string, label: string, maxBytes: number): unknown {
  let size: number;
  try {
    size = statSync(file).size;
  } catch (cause) {
    throw new RelayKnowledgeError("KnowledgeBundleMissingError", `${label} is missing`, { cause });
  }
  if (size > maxBytes) {
    throw new RelayKnowledgeError("KnowledgeBundleSizeError", `${label} exceeds ${maxBytes} bytes`);
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (cause) {
    throw new RelayKnowledgeError("KnowledgeBundleSchemaError", `${label} is malformed`, { cause });
  }
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isSafeLocalRoute(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\/[A-Za-z0-9_./-]*(?:#[A-Za-z0-9_.-]+)?$/.test(value) ||
    value.startsWith("//") ||
    value.startsWith("/api/") ||
    value === "/settings#runtime" ||
    value === "/settings#license"
  ) return false;
  return value.split("#")[0].split("/").every((part) => part !== "." && part !== "..");
}

function validateManifestAndIndex(
  manifestValue: unknown,
  indexValue: unknown,
  packageVersion: string
): { manifest: RelayKnowledgeManifest; index: RelayKnowledgeIndex } {
  assertObject(manifestValue, "knowledge manifest");
  assertObject(indexValue, "knowledge index");
  if (
    manifestValue.schemaVersion !== RELAY_KNOWLEDGE_SCHEMA_VERSION ||
    indexValue.schemaVersion !== RELAY_KNOWLEDGE_SCHEMA_VERSION
  ) {
    throw new RelayKnowledgeError("KnowledgeBundleSchemaError", "Unsupported knowledge schema version");
  }
  if (manifestValue.releaseVersion !== packageVersion) {
    throw new RelayKnowledgeError(
      "KnowledgeBundleVersionError",
      `Knowledge bundle ${String(manifestValue.releaseVersion)} does not match Relay ${packageVersion}`
    );
  }
  if (!Array.isArray(manifestValue.entries) || !Array.isArray(indexValue.sections)) {
    throw new RelayKnowledgeError("KnowledgeBundleSchemaError", "Knowledge entries and sections must be arrays");
  }
  const manifest = manifestValue as unknown as RelayKnowledgeManifest;
  const index = indexValue as unknown as RelayKnowledgeIndex;
  if (!isHash(manifest.indexHash) || sha256(stableJson(index)) !== manifest.indexHash) {
    throw new RelayKnowledgeError("KnowledgeBundleIntegrityError", "Knowledge index hash mismatch");
  }
  if (!isHash(manifest.bundleHash) || !isHash(manifest.sourceBundleHash)) {
    throw new RelayKnowledgeError("KnowledgeBundleSchemaError", "Knowledge root hashes are invalid");
  }
  if (manifest.entryCount !== manifest.entries.length || manifest.sectionCount !== index.sections.length) {
    throw new RelayKnowledgeError("KnowledgeBundleIntegrityError", "Knowledge counts do not match manifest");
  }
  const ids = new Set<string>();
  const declarations = new Map<string, RelayKnowledgeManifest["entries"][number]>();
  const paths = new Set<string>();
  for (const entry of manifest.entries) {
    const expectedPath = `entries/${entry.id.replace(":", ".")}.json`;
    if (
      !/^(guide|api):[a-z0-9][a-z0-9-]*$/.test(entry.id) ||
      (entry.kind !== "guide" && entry.kind !== "api") ||
      !entry.id.startsWith(`${entry.kind}:`) ||
      entry.path !== expectedPath ||
      !isHash(entry.contentHash) ||
      !isHash(entry.sourceHash) ||
      !isHash(entry.sourceStateHash) ||
      !isSafeKnowledgeSourceHref(entry.publicUrl, entry.kind) ||
      ids.has(entry.id) ||
      paths.has(entry.path)
    ) {
      throw new RelayKnowledgeError("KnowledgeBundleSchemaError", "Knowledge entry declaration is invalid");
    }
    ids.add(entry.id);
    paths.add(entry.path);
    declarations.set(entry.id, entry);
  }
  const rootHash = sha256(stableJson({
    corpus: manifest.corpus,
    entries: manifest.entries.map(({ contentHash, id, path, publicUrl }) => ({ contentHash, id, path, publicUrl })),
    indexHash: manifest.indexHash,
    releaseVersion: manifest.releaseVersion,
    sourceBundleHash: manifest.sourceBundleHash,
  }));
  if (rootHash !== manifest.bundleHash) {
    throw new RelayKnowledgeError("KnowledgeBundleIntegrityError", "Knowledge bundle root hash mismatch");
  }
  for (const section of index.sections) {
    const declaration = declarations.get(section.sourceId);
    if (
      !declaration ||
      typeof section.sectionId !== "string" ||
      section.kind !== declaration.kind ||
      section.entryContentHash !== declaration.contentHash ||
      section.sourceStateHash !== declaration.sourceStateHash ||
      !Array.isArray(section.searchTerms) ||
      !Array.isArray(section.apiPaths) ||
      section.apiPaths.some((path) => typeof path !== "string" || !path.startsWith("/api/")) ||
      !Array.isArray(section.productRoutes) ||
      section.productRoutes.some((route) => !isSafeLocalRoute(route))
    ) {
      throw new RelayKnowledgeError("KnowledgeBundleSchemaError", "Knowledge index section is invalid");
    }
  }
  return { manifest, index };
}

function indexScore(section: RelayKnowledgeIndexSection, query: string): number {
  const queryTokens = tokens(query);
  const requestedPaths = apiPaths(query);
  const heading = section.heading.toLowerCase();
  const title = section.title.toLowerCase();
  const normalized = query.toLowerCase();
  let score = 0;
  for (const path of requestedPaths) {
    if (section.apiPaths.includes(path)) score += 1_000;
    if (heading.includes(path.toLowerCase())) score += 2_000;
  }
  if (normalized.includes(heading) && heading.length > 5) score += 80;
  if (normalized.includes(title) && title.length > 5) score += 60;
  const search = new Set(section.searchTerms);
  for (const token of queryTokens) {
    if (heading.includes(token)) score += 18;
    if (title.includes(token)) score += 10;
    if (search.has(token)) score += 5;
  }
  if (score > 0 && requestedPaths.length === 0 && section.kind === "guide") score += 20;
  if (score > 0 && /\b(?:how|where|show me)\b/i.test(query) && section.kind === "guide") score += 40;
  if (score > 0 && requestedPaths.length > 0 && section.kind === "api") score += 100;
  return score;
}

function sectionScore(
  section: RelayKnowledgeSection,
  indexRecord: RelayKnowledgeIndexSection,
  query: string
): number {
  const queryTokens = tokens(query);
  const haystack = `${section.heading}\n${section.markdown}`.toLowerCase();
  let score = indexScore(indexRecord, query);
  for (const token of queryTokens) {
    if (section.heading.toLowerCase().includes(token)) score += 30;
    const occurrences = haystack.split(token).length - 1;
    score += Math.min(occurrences, 4) * 4;
  }
  for (const path of apiPaths(query)) {
    if (haystack.includes(path.toLowerCase())) score += 3_000;
  }
  return score;
}

function validateEntry(
  value: unknown,
  declaration: RelayKnowledgeManifest["entries"][number]
): RelayKnowledgeEntry {
  assertObject(value, `${declaration.id} entry`);
  const entry = value as unknown as RelayKnowledgeEntry;
  if (
    entry.schemaVersion !== RELAY_KNOWLEDGE_SCHEMA_VERSION ||
    entry.id !== declaration.id ||
    entry.kind !== declaration.kind ||
    entry.sourceHash !== declaration.sourceHash ||
    entry.sourceStateHash !== declaration.sourceStateHash ||
    entry.publicUrl !== declaration.publicUrl ||
    !isSafeKnowledgeSourceHref(entry.publicUrl, entry.kind) ||
    entry.contentHash !== declaration.contentHash ||
    !Array.isArray(entry.sections) ||
    !Array.isArray(entry.productRoutes) ||
    entry.productRoutes.some((route) => !isSafeLocalRoute(route))
  ) {
    throw new RelayKnowledgeError("KnowledgeBundleIntegrityError", `${declaration.id} does not match its declaration`);
  }
  const sectionIds = new Set<string>();
  for (const section of entry.sections) {
    if (
      !section ||
      typeof section.id !== "string" ||
      sectionIds.has(section.id) ||
      typeof section.heading !== "string" ||
      typeof section.markdown !== "string" ||
      !Number.isInteger(section.wordCount) ||
      section.wordCount < 0
    ) {
      throw new RelayKnowledgeError("KnowledgeBundleSchemaError", `${entry.id} contains an invalid section`);
    }
    sectionIds.add(section.id);
  }
  const { contentHash: _ignored, ...withoutHash } = entry;
  if (sha256(stableJson(withoutHash)) !== entry.contentHash) {
    throw new RelayKnowledgeError("KnowledgeBundleIntegrityError", `${declaration.id} content hash mismatch`);
  }
  return entry;
}

export function rankKnowledgeIndex(
  index: RelayKnowledgeIndex,
  query: string
): RelayKnowledgeIndexSection[] {
  return index.sections
    .map((section) => ({ section, score: indexScore(section, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      a.section.kind.localeCompare(b.section.kind) ||
      a.section.sourceId.localeCompare(b.section.sourceId) ||
      a.section.ordinal - b.section.ordinal
    )
    .map(({ section }) => section);
}

function routeLabel(route: string): string {
  const fragment = route.split("#")[1];
  if (fragment === "settings-license") return "Open License settings";
  if (fragment === "settings-providers") return "Open Providers & runtimes settings";
  const root = route.split("#")[0].split("/").filter(Boolean)[0] ?? "dashboard";
  const labels: Record<string, string> = {
    agents: "Agents", apps: "Apps", blueprints: "Blueprints", chat: "Chat",
    costs: "Costs", customers: "Customers", documents: "Documents", inbox: "Inbox",
    monitor: "Monitor", packs: "Packs", projects: "Projects", schedules: "Schedules",
    settings: "Settings", tables: "Tables", tasks: "Tasks", workflows: "Workflows",
  };
  return `Open ${labels[root] ?? root.replace(/(^|-)([a-z])/g, (_m, _p, c) => ` ${c.toUpperCase()}`).trim()}`;
}

function chooseRoutes(sections: LoadedSection[], query: string): string[] {
  const queryTokens = tokens(query);
  return [...new Set(sections.flatMap((section) => section.productRoutes))]
    .map((route) => {
      const label = routeLabel(route).toLowerCase();
      const score = queryTokens.reduce((total, token) => total + (label.includes(token) || route.includes(token) ? 1 : 0), 0);
      return { route, score };
    })
    .sort((a, b) => b.score - a.score || a.route.localeCompare(b.route))
    .slice(0, 2)
    .map(({ route }) => route);
}

function truncateToBudget(markdown: string, remainingTokens: number): { markdown: string; tokens: number; truncated: boolean } {
  const maxChars = remainingTokens * 4;
  if (markdown.length <= maxChars) {
    return { markdown, tokens: Math.ceil(markdown.length / 4), truncated: false };
  }
  const candidate = markdown.slice(0, Math.max(0, maxChars - 1));
  const boundary = Math.max(candidate.lastIndexOf("\n\n"), candidate.lastIndexOf(". "));
  const cut = boundary > maxChars * 0.6 ? candidate.slice(0, boundary + 1) : candidate;
  return { markdown: `${cut.trimEnd()}…`, tokens: Math.ceil((cut.length + 1) / 4), truncated: true };
}

export function prepareRelayKnowledgeTurn(
  query: string,
  options: { rootDir?: string } = {}
): RelayKnowledgeTurn {
  if (!isRelayKnowledgeHelpIntent(query)) return { status: "not-requested" };
  let packageVersion = "unknown";
  try {
    const root = options.rootDir ?? getAppRoot(import.meta.dirname, 3);
    const packageValue = readJson(join(root, "package.json"), "package.json", MAX_MANIFEST_BYTES);
    assertObject(packageValue, "package.json");
    if (typeof packageValue.version !== "string") {
      throw new RelayKnowledgeError("KnowledgeBundleSchemaError", "package.json version is invalid");
    }
    packageVersion = packageValue.version;
    const manifestValue = readJson(join(root, "knowledge/manifest.json"), "knowledge manifest", MAX_MANIFEST_BYTES);
    const indexValue = readJson(join(root, "knowledge/index.json"), "knowledge index", MAX_INDEX_BYTES);
    const { manifest, index } = validateManifestAndIndex(manifestValue, indexValue, packageVersion);
    const rankedIndex = rankKnowledgeIndex(index, query);
    if (rankedIndex.length === 0) {
      throw new RelayKnowledgeError("KnowledgeNoMatchError", "No indexed section matches the help query");
    }

    const sourceIds = [...new Set(rankedIndex.map(({ sourceId }) => sourceId))].slice(0, 3);
    const loaded: LoadedSection[] = [];
    for (const sourceId of sourceIds) {
      const declaration = manifest.entries.find((entry) => entry.id === sourceId);
      if (!declaration) {
        throw new RelayKnowledgeError("KnowledgeBundleIntegrityError", `Missing declaration for ${sourceId}`);
      }
      const entryValue = readJson(join(root, "knowledge", declaration.path), declaration.id, MAX_ENTRY_BYTES);
      const entry = validateEntry(entryValue, declaration);
      for (const section of entry.sections) {
        const indexRecord = index.sections.find(
          (record) => record.sourceId === entry.id && record.sectionId === section.id
        );
        if (!indexRecord) {
          throw new RelayKnowledgeError("KnowledgeBundleIntegrityError", `${entry.id}/${section.id} is absent from index`);
        }
        if (
          indexRecord.heading !== section.heading ||
          indexRecord.wordCount !== section.wordCount ||
          stableJson(indexRecord.productRoutes) !== stableJson(entry.productRoutes)
        ) {
          throw new RelayKnowledgeError(
            "KnowledgeBundleIntegrityError",
            `${entry.id}/${section.id} index metadata does not match its entry`
          );
        }
        loaded.push({
          sourceId: entry.id,
          sectionId: section.id,
          sourceKind: entry.kind,
          title: entry.title,
          heading: section.heading,
          wordCount: section.wordCount,
          truncated: false,
          markdown: section.markdown,
          publicUrl: entry.publicUrl,
          productRoutes: indexRecord.productRoutes,
          score: sectionScore(section, indexRecord, query),
        });
      }
    }
    loaded.sort((a, b) =>
      b.score - a.score || a.sourceKind.localeCompare(b.sourceKind) ||
      a.sourceId.localeCompare(b.sourceId) || a.sectionId.localeCompare(b.sectionId)
    );

    let remainingTokens = KNOWLEDGE_MAX_TOKENS;
    const selected: LoadedSection[] = [];
    for (const section of loaded) {
      if (selected.length >= KNOWLEDGE_MAX_SECTIONS || remainingTokens <= 0) break;
      const bounded = truncateToBudget(section.markdown, remainingTokens);
      if (!bounded.markdown.trim()) continue;
      selected.push({ ...section, markdown: bounded.markdown, truncated: bounded.truncated });
      remainingTokens -= bounded.tokens;
    }
    if (selected.length === 0) {
      throw new RelayKnowledgeError("KnowledgeNoMatchError", "No non-empty current section matches the help query");
    }

    const receiptSections = selected.map(({
      markdown: _m,
      productRoutes: _r,
      publicUrl: _u,
      score: _s,
      ...receipt
    }) => receipt);
    const receipt: RelayKnowledgeReceipt = {
      status: "ready",
      releaseVersion: manifest.releaseVersion,
      sections: receiptSections,
    };
    const sources: QuickAccessItem[] = selected.slice(0, 2).map((section) => ({
      kind: "knowledge-source",
      sourceId: section.sourceId,
      sectionId: section.sectionId,
      sourceKind: section.sourceKind,
      heading: section.heading,
      releaseVersion: manifest.releaseVersion,
      href: section.publicUrl,
      label: `${section.sourceKind === "api" ? "API" : "Guide"} · ${section.title} / ${section.heading} · Relay ${manifest.releaseVersion}`,
    }));
    const actions: QuickAccessItem[] = chooseRoutes(selected, query).map((href) => ({
      kind: "knowledge-action",
      sourceId: selected.find((section) => section.productRoutes.includes(href))?.sourceId ?? selected[0].sourceId,
      href,
      label: routeLabel(href),
    }));
    const passages = selected.map((section, index) => [
      `### Source ${index + 1}: ${section.sourceKind === "api" ? "API" : "Guide"} · ${section.title} · ${section.heading} · Relay ${manifest.releaseVersion}`,
      section.markdown,
    ].join("\n")).join("\n\n");
    return {
      status: "ready",
      receipt,
      quickAccess: [...sources, ...actions],
      prompt: [
        "\n\n## Verified current Relay knowledge",
        `The following bounded passages are from the packaged Relay ${manifest.releaseVersion} knowledge bundle.`,
        "Use them as the only verified source for claims about current Relay behavior. Cite the visible source label in your answer. If they do not establish a claim, say so. Do not invent routes, buttons, or API behavior; navigation actions are added separately from allowlisted metadata.",
        "",
        passages,
      ].join("\n"),
    };
  } catch (error) {
    const knowledgeError = error instanceof RelayKnowledgeError
      ? error
      : new RelayKnowledgeError("KnowledgeBundleSchemaError", "Knowledge retrieval failed", { cause: error });
    console.error(`[knowledge-chat] ${knowledgeError.name}: ${knowledgeError.message}`);
    const noMatch = knowledgeError.code === "KnowledgeNoMatchError";
    return {
      status: "unavailable",
      quickAccess: [],
      receipt: {
        status: "unavailable",
        releaseVersion: packageVersion,
        failureCode: knowledgeError.code,
        sections: [],
      },
      response: noMatch
        ? `I don’t have a verified Relay ${packageVersion} knowledge section that answers that yet.`
        : `Verified Relay ${packageVersion} product knowledge is unavailable right now, so I won’t substitute stale or unverified guidance.`,
    };
  }
}

export function appendRelayKnowledgePrompt(
  systemPrompt: string,
  turn: RelayKnowledgeTurn
): string {
  return turn.status === "ready" ? `${systemPrompt}${turn.prompt}` : systemPrompt;
}

export function mergeRelayKnowledgeQuickAccess(
  existing: QuickAccessItem[],
  turn: RelayKnowledgeTurn
): QuickAccessItem[] {
  if (turn.status !== "ready") return existing;
  const seen = new Set<string>();
  return [...existing, ...turn.quickAccess].filter((item) => {
    const key = item.kind === "knowledge-source"
      ? `source:${item.sourceId}:${item.sectionId}`
      : item.kind === "knowledge-action"
        ? `action:${item.href}`
        : `entity:${item.entityType}:${item.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function relayKnowledgeMetadata(turn: RelayKnowledgeTurn): { knowledge?: RelayKnowledgeReceipt } {
  return turn.status === "not-requested" ? {} : { knowledge: turn.receipt };
}
