import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let yaml;

export const KNOWLEDGE_SCHEMA_VERSION = 2;
export const MAX_ENTRY_BYTES = 512 * 1024;
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

export class KnowledgeSourceStaleError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "KnowledgeSourceStaleError";
    this.details = details;
  }
}

export class KnowledgeBundleSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = "KnowledgeBundleSchemaError";
  }
}

export class KnowledgeBundleIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = "KnowledgeBundleIntegrityError";
  }
}

export class KnowledgeBundleVersionError extends Error {
  constructor(expected, actual) {
    super(`Knowledge bundle version ${actual ?? "<missing>"} does not match Relay ${expected}`);
    this.name = "KnowledgeBundleVersionError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class KnowledgeBundleWriteError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "KnowledgeBundleWriteError";
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted(value[key])]),
    );
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(sorted(value), null, 2)}\n`;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new KnowledgeBundleSchemaError(`${label} must be an object`);
  }
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new KnowledgeBundleSchemaError(`${label} must be a non-empty string`);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) {
    throw new KnowledgeBundleSchemaError(`${label} must be an array`);
  }
}

function assertHash(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new KnowledgeBundleSchemaError(`${label} must be a SHA-256 hash`);
  }
}

function unique(values) {
  return [...new Set(values)].sort();
}

function assertUnitId(value, label) {
  assertString(value, label);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value)) {
    throw new KnowledgeBundleSchemaError(`${label} is unsafe: ${value}`);
  }
}

function normalizeRelativeSourcePath(value, label) {
  assertString(value, label);
  if (
    path.isAbsolute(value) ||
    value.includes("\\") ||
    value.split("/").some((part) => part === "" || part === "." || part === "..") ||
    !/^[A-Za-z0-9_.\/[\]-]+$/.test(value)
  ) {
    throw new KnowledgeBundleSchemaError(`${label} is not a safe relative path: ${value}`);
  }
  return value;
}

function slug(value) {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "section";
}

const STOP_TERMS = new Set([
  "and", "are", "for", "from", "how", "into", "its", "relay", "that", "the",
  "this", "use", "with", "your", "you", "api", "what", "when", "where", "which",
]);

function searchTerms(values) {
  return unique(
    values
      .join(" ")
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [],
  ).filter((term) => term.length > 2 && !STOP_TERMS.has(term));
}

function parseFrontmatter(markdown, label) {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: normalized };
  yaml ??= require("js-yaml");
  const data = yaml.load(match[1]) ?? {};
  assertObject(data, `${label} frontmatter`);
  return { data, body: normalized.slice(match[0].length) };
}

function stripImages(markdown) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^\n)]+\)/g, (_match, alt) =>
      alt.trim() ? `[Figure: ${alt.trim()}]` : "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseMarkdownSections(markdown, label = "knowledge source") {
  const { data, body } = parseFrontmatter(markdown, label);
  const lines = body.split("\n");
  const sections = [];
  let current = { heading: "Overview", level: 2, lines: [] };
  let sawContentHeading = false;

  const finish = () => {
    const content = stripImages(current.lines.join("\n"));
    if (!content && current.heading === "Overview") return;
    const baseId = slug(current.heading);
    const collisions = sections.filter((section) => section.id === baseId || section.id.startsWith(`${baseId}-`)).length;
    sections.push({
      id: collisions === 0 ? baseId : `${baseId}-${collisions + 1}`,
      heading: current.heading,
      level: current.level,
      markdown: content,
      wordCount: content ? (content.match(/\b[\p{L}\p{N}][\p{L}\p{N}'-]*\b/gu) ?? []).length : 0,
    });
  };

  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+?)\s*$/);
    if (heading) {
      if (heading[1].length === 1 && !sawContentHeading && current.lines.every((item) => !item.trim())) {
        continue;
      }
      finish();
      current = {
        heading: heading[2].replace(/\s+#+$/, "").trim(),
        level: Math.max(2, heading[1].length),
        lines: [],
      };
      sawContentHeading = true;
    } else {
      current.lines.push(line.replace(/[ \t]+$/g, ""));
    }
  }
  finish();

  if (sections.length === 0) {
    throw new KnowledgeBundleSchemaError(`${label} contains no knowledge sections`);
  }
  const ids = sections.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) {
    throw new KnowledgeBundleSchemaError(`${label} contains duplicate section ids`);
  }
  return { frontmatter: data, sections };
}

export function normalizeProductRoute(value, label = "product route") {
  assertString(value, label);
  const parts = value.split("#");
  const pathname = parts[0];
  const fragment = parts[1];
  if (
    parts.length > 2 ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    value.includes("?") ||
    value.includes("\\") ||
    pathname.split("/").some((part) => part === ".." || part === ".") ||
    !/^\/[A-Za-z0-9_./-]*$/.test(pathname) ||
    (fragment !== undefined && !/^[A-Za-z0-9_.-]+$/.test(fragment))
  ) {
    throw new KnowledgeBundleSchemaError(`${label} is not a safe absolute-local route: ${value}`);
  }
  const aliases = new Map([
    ["/settings#runtime", "/settings#settings-providers"],
    ["/settings#license", "/settings#settings-license"],
  ]);
  return aliases.get(value) ?? value;
}

export function canonicalPublicUrl(kind, sourceSlug) {
  if (kind !== "guide" && kind !== "api") {
    throw new KnowledgeBundleSchemaError(`Unsupported knowledge source kind: ${kind}`);
  }
  const safeSlug = normalizeRelativeSourcePath(sourceSlug, `${kind} public slug`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(safeSlug)) {
    throw new KnowledgeBundleSchemaError(`${kind} public slug is not canonical: ${sourceSlug}`);
  }
  const publicSlug = kind === "guide" ? safeSlug.replace(/^\d+-/, "") : safeSlug;
  if (!publicSlug) {
    throw new KnowledgeBundleSchemaError(`${kind} public slug is empty after normalization`);
  }
  return `https://orionfold.com/relay/${kind === "guide" ? "docs" : "api"}/${publicSlug}/`;
}

export function validateCanonicalPublicUrl(value, kind, label = "public URL") {
  assertString(value, label);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new KnowledgeBundleSchemaError(`${label} is not a valid URL: ${value}`);
  }
  const family = kind === "guide" ? "docs" : kind === "api" ? "api" : null;
  if (
    !family ||
    parsed.protocol !== "https:" ||
    parsed.hostname !== "orionfold.com" ||
    parsed.port !== "" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    !new RegExp(`^/relay/${family}/[a-z0-9][a-z0-9-]*/$`).test(parsed.pathname) ||
    parsed.href !== value
  ) {
    throw new KnowledgeBundleSchemaError(`${label} is not a canonical ${kind} destination: ${value}`);
  }
  return value;
}

function findAppRoutePage(appRoot, pathname) {
  let candidates = [path.join(appRoot, "src", "app")];
  for (const segment of pathname.split("/").filter(Boolean)) {
    const next = [];
    for (const candidate of candidates) {
      const exact = path.join(candidate, segment);
      if (existsSync(exact) && lstatSync(exact).isDirectory()) next.push(exact);
      if (!existsSync(candidate)) continue;
      for (const entry of readdirSync(candidate, { withFileTypes: true })) {
        if (entry.isDirectory() && /^\[[^\]]+\]$/.test(entry.name)) {
          next.push(path.join(candidate, entry.name));
        }
      }
    }
    candidates = unique(next);
  }
  for (const candidate of candidates) {
    for (const filename of ["page.tsx", "page.ts", "page.jsx", "page.js"]) {
      const file = path.join(candidate, filename);
      if (existsSync(file)) return file;
    }
  }
  return null;
}

export function verifyProductRouteTargets(routes, appRoot) {
  for (const rawRoute of unique(routes)) {
    const route = normalizeProductRoute(rawRoute);
    if (route !== rawRoute) {
      throw new KnowledgeBundleSchemaError(`Knowledge product route is not canonical: ${rawRoute}`);
    }
    const [pathname, fragment] = route.split("#");
    const page = findAppRoutePage(appRoot, pathname);
    if (!page) {
      throw new KnowledgeBundleSchemaError(`Knowledge product route has no App Router page: ${pathname}`);
    }
    if (fragment) {
      const source = readFileSync(page, "utf8");
      const escaped = fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\bid\\s*=\\s*["']${escaped}["']`).test(source)) {
        throw new KnowledgeBundleSchemaError(
          `Knowledge product route fragment #${fragment} is absent from ${path.relative(appRoot, page)}`,
        );
      }
    }
  }
}

function readJson(file, label) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new KnowledgeBundleSchemaError(
      `${label} is missing or malformed at ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function requireCleanTracker(tracker, units, label) {
  const dirty = units.filter((unit) => unit.dirty === true).map((unit) => unit.id);
  const unresolved = [
    ...(tracker.staleEndpoints ?? []),
    ...(tracker.unassignedEndpoints ?? []),
  ];
  if (dirty.length || unresolved.length) {
    throw new KnowledgeSourceStaleError(
      `${label} source is dirty or unresolved`,
      [...dirty.map((id) => `dirty:${id}`), ...unresolved.map((id) => `unresolved:${id}`)],
    );
  }
}

function fileHash(file, label) {
  try {
    return sha256(readFileSync(file));
  } catch (error) {
    throw new KnowledgeBundleSchemaError(
      `${label} is missing at ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function contentHash(entry) {
  const { contentHash: _ignored, ...withoutHash } = entry;
  return sha256(stableJson(withoutHash));
}

function entryIndexRecords(entry) {
  return entry.sections.map((section, ordinal) => ({
    apiPaths: entry.apiPaths,
    entryContentHash: entry.contentHash,
    heading: section.heading,
    kind: entry.kind,
    ordinal,
    productRoutes: entry.productRoutes,
    searchTerms: searchTerms([
      entry.title,
      entry.summary ?? "",
      section.heading,
      ...(entry.features ?? []),
      ...(entry.apiPaths ?? []),
    ]),
    sectionId: section.id,
    sourceId: entry.id,
    sourceStateHash: entry.sourceStateHash,
    title: entry.title,
    wordCount: section.wordCount,
  }));
}

function validateUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new KnowledgeBundleSchemaError(`${label} contains duplicate ${value}`);
    seen.add(value);
  }
}

export function createKnowledgeArtifact({ assetsRoot, packageJsonPath }) {
  const packageJson = readJson(packageJsonPath, "package.json");
  assertString(packageJson.version, "package.json version");

  const docsRoot = path.join(assetsRoot, "docs");
  const apiRoot = path.join(assetsRoot, "api");
  const screenshotsRoot = path.join(assetsRoot, "screenshots");
  const guideTracker = readJson(path.join(docsRoot, "guide-tracker.json"), "guide tracker");
  const apiTracker = readJson(path.join(apiRoot, "api-tracker.json"), "API tracker");
  const screenshotManifest = readJson(
    path.join(screenshotsRoot, "metadata", "manifest.json"),
    "screenshot manifest",
  );

  const chapters = guideTracker.chapters ?? [];
  const groups = apiTracker.groups ?? [];
  requireCleanTracker(guideTracker, chapters, "Guide");
  requireCleanTracker(apiTracker, groups, "API");
  validateUnique(chapters.map(({ id }) => id), "Guide tracker");
  validateUnique(groups.map(({ id }) => id), "API tracker");

  const screenshotEntriesById = new Map();
  for (const screenshot of screenshotManifest.entries ?? []) {
    assertString(screenshot.id, "screenshot id");
    const bucket = screenshotEntriesById.get(screenshot.id) ?? [];
    bucket.push(screenshot);
    screenshotEntriesById.set(screenshot.id, bucket);
  }

  const entries = [];
  for (const chapter of chapters) {
    assertUnitId(chapter.id, "guide chapter id");
    normalizeRelativeSourcePath(chapter.slug, `${chapter.id} slug`);
    const markdownPath = path.join(docsRoot, "guides", `${chapter.slug}.md`);
    const markdown = readFileSync(markdownPath, "utf8");
    const { frontmatter, sections } = parseMarkdownSections(markdown, chapter.id);
    if (frontmatter.id && frontmatter.id !== chapter.id) {
      throw new KnowledgeBundleSchemaError(`${chapter.id} frontmatter id is ${frontmatter.id}`);
    }

    const screenshots = [];
    for (const target of unique(chapter.screenshotTargets ?? [])) {
      const mapped = screenshotEntriesById.get(target) ?? [];
      if (mapped.length === 0) {
        throw new KnowledgeSourceStaleError(`${chapter.id} has no captured screenshot for ${target}`, [target]);
      }
      for (const item of mapped) {
        normalizeRelativeSourcePath(item.path, `${target} screenshot path`);
        const route = normalizeProductRoute(item.route, `${target} product route`);
        screenshots.push({
          id: target,
          path: item.path,
          productRoute: route,
          sha256: fileHash(path.join(screenshotsRoot, item.path), `${target} screenshot`),
          theme: item.theme,
          viewport: item.viewport,
        });
      }
    }
    screenshots.sort((a, b) => a.path.localeCompare(b.path));

    const sourceState = {
      features: chapter.features ?? [],
      featureHashes: chapter.sourceState?.featureHashes ?? {},
      journeys: chapter.journeys ?? [],
      screenshots,
    };
    const entry = {
      apiPaths: [],
      features: unique(chapter.features ?? []),
      id: `guide:${chapter.id}`,
      journeys: unique(chapter.journeys ?? []),
      kind: "guide",
      publicUrl: canonicalPublicUrl("guide", chapter.slug),
      productRoutes: unique(screenshots.map(({ productRoute }) => productRoute)),
      schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
      screenshots,
      sections,
      sourceHash: sha256(markdown),
      sourcePath: `docs/guides/${chapter.slug}.md`,
      sourceStateHash: sha256(stableJson(sourceState)),
      summary: chapter.summary ?? "",
      title: chapter.title,
    };
    entry.contentHash = contentHash(entry);
    entries.push(entry);
  }

  const endpoints = apiTracker.endpoints ?? [];
  validateUnique(endpoints.map(({ path: endpointPath }) => endpointPath), "API tracker endpoints");
  for (const group of groups) {
    assertUnitId(group.id, "API group id");
    normalizeRelativeSourcePath(group.slug, `${group.id} slug`);
    const markdownPath = path.join(apiRoot, "reference", `${group.slug}.md`);
    const markdown = readFileSync(markdownPath, "utf8");
    const { frontmatter, sections } = parseMarkdownSections(markdown, group.id);
    if (frontmatter.id && frontmatter.id !== group.id) {
      throw new KnowledgeBundleSchemaError(`${group.id} frontmatter id is ${frontmatter.id}`);
    }
    const ownedEndpoints = endpoints
      .filter((endpoint) => endpoint.group === group.id)
      .sort((a, b) => a.path.localeCompare(b.path));
    const declared = unique(group.endpoints ?? []);
    const actual = ownedEndpoints.map(({ path: endpointPath }) => endpointPath);
    if (JSON.stringify(declared) !== JSON.stringify(unique(actual))) {
      throw new KnowledgeSourceStaleError(`${group.id} endpoint ownership is stale`, [
        `declared:${declared.join(",")}`,
        `actual:${unique(actual).join(",")}`,
      ]);
    }
    for (const endpoint of ownedEndpoints) {
      if (typeof endpoint.path !== "string" || !endpoint.path.startsWith("/api/") || endpoint.path.includes("..")) {
        throw new KnowledgeBundleSchemaError(`${group.id} contains unsafe API path ${endpoint.path}`);
      }
      normalizeRelativeSourcePath(endpoint.sourceFile, `${endpoint.path} source file`);
      if (!markdown.includes(endpoint.path)) {
        throw new KnowledgeSourceStaleError(`${group.id} reference does not mention ${endpoint.path}`, [endpoint.path]);
      }
    }
    const sourceState = {
      endpoints: ownedEndpoints.map((endpoint) => ({
        methods: unique(endpoint.methods ?? []),
        path: endpoint.path,
        sourceFile: endpoint.sourceFile,
        sourceHash: endpoint.sourceHash,
        stability: endpoint.stability,
      })),
      stability: group.stability,
    };
    const entry = {
      apiPaths: actual,
      features: [],
      id: `api:${group.id}`,
      journeys: [],
      kind: "api",
      publicUrl: canonicalPublicUrl("api", group.slug),
      productRoutes: [],
      schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
      screenshots: [],
      sections,
      sourceHash: sha256(markdown),
      sourcePath: `api/reference/${group.slug}.md`,
      sourceStateHash: sha256(stableJson(sourceState)),
      stability: group.stability,
      summary: group.summary ?? "",
      title: group.title,
    };
    entry.contentHash = contentHash(entry);
    entries.push(entry);
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  validateUnique(entries.map(({ id }) => id), "Knowledge entries");

  const entryFiles = entries.map((entry) => ({
    contentHash: entry.contentHash,
    id: entry.id,
    kind: entry.kind,
    path: `entries/${entry.id.replace(":", ".")}.json`,
    publicUrl: entry.publicUrl,
    sourceHash: entry.sourceHash,
    sourceStateHash: entry.sourceStateHash,
    title: entry.title,
  }));
  const index = {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    sections: entries.flatMap(entryIndexRecords),
  };
  const indexHash = sha256(stableJson(index));
  const corpus = {
    apiDocsVersion: apiTracker.apiDocsVersion,
    apiTrackerHash: fileHash(path.join(apiRoot, "api-tracker.json"), "API tracker"),
    guideTrackerHash: fileHash(path.join(docsRoot, "guide-tracker.json"), "guide tracker"),
    guideVersion: guideTracker.guideVersion,
    screenshotManifestHash: fileHash(
      path.join(screenshotsRoot, "metadata", "manifest.json"),
      "screenshot manifest",
    ),
  };
  const sourceBundleHash = sha256(
    stableJson(entries.map(({ id, sourceHash, sourceStateHash }) => ({ id, sourceHash, sourceStateHash }))),
  );
  const bundleHash = sha256(
    stableJson({
      corpus,
      entries: entryFiles.map(({ contentHash, id, path: entryPath, publicUrl }) => ({
        contentHash,
        id,
        path: entryPath,
        publicUrl,
      })),
      indexHash,
      releaseVersion: packageJson.version,
      sourceBundleHash,
    }),
  );
  const manifest = {
    bundleHash,
    corpus,
    entries: entryFiles,
    entryCount: entries.length,
    indexHash,
    releaseVersion: packageJson.version,
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    sectionCount: index.sections.length,
    sourceBundleHash,
  };

  const files = new Map([
    ["manifest.json", stableJson(manifest)],
    ["index.json", stableJson(index)],
    ...entries.map((entry) => [
      `entries/${entry.id.replace(":", ".")}.json`,
      stableJson(entry),
    ]),
  ]);
  return { entries, files, index, manifest };
}

function listFiles(root, prefix = "") {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return listFiles(absolute, relative);
    if (entry.isFile()) return [relative];
    throw new KnowledgeBundleSchemaError(`Knowledge bundle contains unsupported filesystem entry ${relative}`);
  });
}

export function verifyKnowledgeBundle({ bundleDir, packageJsonPath, appRoot = path.dirname(packageJsonPath) }) {
  const packageJson = readJson(packageJsonPath, "package.json");
  const manifest = readJson(path.join(bundleDir, "manifest.json"), "knowledge manifest");
  const index = readJson(path.join(bundleDir, "index.json"), "knowledge index");
  assertObject(manifest, "knowledge manifest");
  assertObject(index, "knowledge index");
  assertObject(manifest.corpus, "knowledge manifest corpus");
  assertArray(manifest.entries, "knowledge manifest entries");
  assertArray(index.sections, "knowledge index sections");
  if (manifest.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION || index.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION) {
    throw new KnowledgeBundleSchemaError(`Unsupported knowledge schema version`);
  }
  if (manifest.releaseVersion !== packageJson.version) {
    throw new KnowledgeBundleVersionError(packageJson.version, manifest.releaseVersion);
  }
  assertHash(manifest.bundleHash, "manifest bundleHash");
  assertHash(manifest.indexHash, "manifest indexHash");
  assertHash(manifest.sourceBundleHash, "manifest sourceBundleHash");
  assertString(manifest.corpus.guideVersion, "manifest guideVersion");
  assertString(manifest.corpus.apiDocsVersion, "manifest apiDocsVersion");
  assertHash(manifest.corpus.guideTrackerHash, "manifest guideTrackerHash");
  assertHash(manifest.corpus.apiTrackerHash, "manifest apiTrackerHash");
  assertHash(manifest.corpus.screenshotManifestHash, "manifest screenshotManifestHash");
  if (sha256(stableJson(index)) !== manifest.indexHash) {
    throw new KnowledgeBundleIntegrityError("Knowledge index hash does not match manifest");
  }

  const expectedFiles = new Set(["manifest.json", "index.json"]);
  const entries = [];
  validateUnique((manifest.entries ?? []).map(({ id }) => id), "Manifest entries");
  validateUnique((manifest.entries ?? []).map(({ path: entryPath }) => entryPath), "Manifest entry paths");
  for (const declaration of manifest.entries ?? []) {
    assertObject(declaration, "manifest entry");
    assertString(declaration.id, "manifest entry id");
    if (!/^(guide|api):[a-z0-9][a-z0-9-]*$/.test(declaration.id)) {
      throw new KnowledgeBundleSchemaError(`Unsafe knowledge source id ${declaration.id}`);
    }
    if (!["guide", "api"].includes(declaration.kind) || !declaration.id.startsWith(`${declaration.kind}:`)) {
      throw new KnowledgeBundleSchemaError(`${declaration.id} has invalid kind ${declaration.kind}`);
    }
    const expectedPath = `entries/${declaration.id.replace(":", ".")}.json`;
    if (declaration.path !== expectedPath) {
      throw new KnowledgeBundleSchemaError(`${declaration.id} path must be ${expectedPath}`);
    }
    assertHash(declaration.sourceHash, `${declaration.id} declared sourceHash`);
    assertHash(declaration.sourceStateHash, `${declaration.id} declared sourceStateHash`);
    assertHash(declaration.contentHash, `${declaration.id} declared contentHash`);
    validateCanonicalPublicUrl(declaration.publicUrl, declaration.kind, `${declaration.id} declared publicUrl`);
    expectedFiles.add(expectedPath);
    const absolute = path.join(bundleDir, expectedPath);
    let bytes;
    try {
      bytes = readFileSync(absolute);
    } catch (error) {
      throw new KnowledgeBundleSchemaError(
        `${declaration.id} entry is missing at ${absolute}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (bytes.length > MAX_ENTRY_BYTES) {
      throw new KnowledgeBundleIntegrityError(`${declaration.id} exceeds ${MAX_ENTRY_BYTES} bytes`);
    }
    let entry;
    try {
      entry = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new KnowledgeBundleSchemaError(
        `${declaration.id} entry is malformed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    assertObject(entry, `${declaration.id} entry`);
    if (entry.id !== declaration.id || entry.kind !== declaration.kind) {
      throw new KnowledgeBundleIntegrityError(`${declaration.id} identity does not match manifest`);
    }
    if (entry.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION) {
      throw new KnowledgeBundleSchemaError(`${entry.id} has unsupported schema version`);
    }
    assertHash(entry.sourceHash, `${entry.id} sourceHash`);
    assertHash(entry.sourceStateHash, `${entry.id} sourceStateHash`);
    assertHash(entry.contentHash, `${entry.id} contentHash`);
    if (entry.contentHash !== contentHash(entry) || entry.contentHash !== declaration.contentHash) {
      throw new KnowledgeBundleIntegrityError(`${entry.id} content hash does not match manifest`);
    }
    if (
      entry.sourceHash !== declaration.sourceHash ||
      entry.sourceStateHash !== declaration.sourceStateHash ||
      entry.publicUrl !== declaration.publicUrl
    ) {
      throw new KnowledgeBundleIntegrityError(`${entry.id} source hashes do not match manifest`);
    }
    validateCanonicalPublicUrl(entry.publicUrl, entry.kind, `${entry.id} publicUrl`);
    assertArray(entry.sections, `${entry.id} sections`);
    assertArray(entry.productRoutes, `${entry.id} productRoutes`);
    assertArray(entry.apiPaths, `${entry.id} apiPaths`);
    assertArray(entry.screenshots, `${entry.id} screenshots`);
    validateUnique(entry.sections.map((section) => section?.id), `${entry.id} sections`);
    for (const section of entry.sections) {
      assertObject(section, `${entry.id} section`);
      assertString(section.id, `${entry.id} section id`);
      assertString(section.heading, `${entry.id}/${section.id} heading`);
      if (typeof section.markdown !== "string") {
        throw new KnowledgeBundleSchemaError(`${entry.id}/${section.id} markdown must be a string`);
      }
      if (!Number.isInteger(section.level) || section.level < 2 || section.level > 3) {
        throw new KnowledgeBundleSchemaError(`${entry.id}/${section.id} level is invalid`);
      }
      if (!Number.isInteger(section.wordCount) || section.wordCount < 0) {
        throw new KnowledgeBundleSchemaError(`${entry.id}/${section.id} wordCount is invalid`);
      }
    }
    for (const route of entry.productRoutes ?? []) {
      if (normalizeProductRoute(route, `${entry.id} product route`) !== route) {
        throw new KnowledgeBundleSchemaError(`${entry.id} contains a noncanonical product route ${route}`);
      }
    }
    for (const apiPath of entry.apiPaths) {
      if (typeof apiPath !== "string" || !apiPath.startsWith("/api/")) {
        throw new KnowledgeBundleSchemaError(`${entry.id} contains invalid API path ${apiPath}`);
      }
    }
    for (const screenshot of entry.screenshots) {
      assertObject(screenshot, `${entry.id} screenshot`);
      assertString(screenshot.id, `${entry.id} screenshot id`);
      normalizeRelativeSourcePath(screenshot.path, `${entry.id} screenshot path`);
      normalizeProductRoute(screenshot.productRoute, `${entry.id} screenshot product route`);
      assertHash(screenshot.sha256, `${entry.id} screenshot sha256`);
    }
    normalizeRelativeSourcePath(entry.sourcePath, `${entry.id} sourcePath`);
    if ((entry.sourcePath ?? "").includes("_ASSETS")) {
      throw new KnowledgeBundleSchemaError(`${entry.id} exposes a non-portable source path`);
    }
    entries.push(entry);
  }

  const actualFiles = listFiles(bundleDir).sort();
  const expected = [...expectedFiles].sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expected)) {
    throw new KnowledgeBundleIntegrityError(
      `Knowledge bundle inventory mismatch; expected ${expected.join(", ")}, found ${actualFiles.join(", ")}`,
    );
  }
  const totalBytes = actualFiles.reduce((sum, file) => sum + lstatSync(path.join(bundleDir, file)).size, 0);
  if (totalBytes > MAX_BUNDLE_BYTES) {
    throw new KnowledgeBundleIntegrityError(`Knowledge bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
  }
  if (manifest.entryCount !== entries.length) {
    throw new KnowledgeBundleIntegrityError(`Manifest entryCount is incorrect`);
  }
  const sectionCount = entries.reduce((sum, entry) => sum + entry.sections.length, 0);
  if (manifest.sectionCount !== sectionCount || index.sections.length !== sectionCount) {
    throw new KnowledgeBundleIntegrityError(`Knowledge section count is inconsistent`);
  }

  const expectedIndex = {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    sections: entries.flatMap(entryIndexRecords),
  };
  if (stableJson(expectedIndex) !== stableJson(index)) {
    throw new KnowledgeBundleIntegrityError(`Knowledge index does not match entry sections`);
  }
  verifyProductRouteTargets(entries.flatMap((entry) => entry.productRoutes), appRoot);
  const sourceBundleHash = sha256(
    stableJson(entries.map(({ id, sourceHash, sourceStateHash }) => ({ id, sourceHash, sourceStateHash }))),
  );
  if (manifest.sourceBundleHash !== sourceBundleHash) {
    throw new KnowledgeBundleIntegrityError(`Knowledge source bundle hash is incorrect`);
  }
  const bundleHash = sha256(
    stableJson({
      corpus: manifest.corpus,
      entries: manifest.entries.map(({ contentHash: hash, id, path: entryPath, publicUrl }) => ({
        contentHash: hash,
        id,
        path: entryPath,
        publicUrl,
      })),
      indexHash: manifest.indexHash,
      releaseVersion: manifest.releaseVersion,
      sourceBundleHash: manifest.sourceBundleHash,
    }),
  );
  if (manifest.bundleHash !== bundleHash) {
    throw new KnowledgeBundleIntegrityError(`Knowledge bundle root hash is incorrect`);
  }

  const serialized = actualFiles
    .map((file) => readFileSync(path.join(bundleDir, file), "utf8"))
    .join("\n");
  const forbidden = [
    /\/Users\/[A-Za-z0-9._-]+\//,
    /~\/orionfold\//,
    /(?:^|["'])_ASSETS(?:\/|["'])/m,
    /(?:ANTHROPIC|OPENAI|GITHUB)_API_KEY\s*=/,
  ];
  for (const pattern of forbidden) {
    if (pattern.test(serialized)) {
      throw new KnowledgeBundleIntegrityError(`Knowledge bundle contains forbidden private or secret material (${pattern})`);
    }
  }

  return {
    bundleHash: manifest.bundleHash,
    bytes: totalBytes,
    entries: entries.length,
    ok: true,
    releaseVersion: manifest.releaseVersion,
    sections: sectionCount,
  };
}

export function reconcileKnowledgeBundle({ files, outDir, packageJsonPath }) {
  const parent = path.dirname(outDir);
  mkdirSync(parent, { recursive: true });
  const stageDir = path.join(parent, `.${path.basename(outDir)}.stage-${process.pid}-${Date.now()}`);
  const backupDir = path.join(parent, `.${path.basename(outDir)}.backup-${process.pid}-${Date.now()}`);
  const written = [];
  const unchanged = [];
  const previous = new Set(listFiles(outDir));
  const desired = new Set(files.keys());
  const removed = [...previous].filter((file) => !desired.has(file)).sort();

  try {
    mkdirSync(stageDir, { recursive: true });
    for (const [relative, content] of files) {
      const destination = path.join(stageDir, relative);
      mkdirSync(path.dirname(destination), { recursive: true });
      const existing = path.join(outDir, relative);
      if (existsSync(existing) && readFileSync(existing, "utf8") === content) {
        linkSync(existing, destination);
        unchanged.push(relative);
      } else {
        writeFileSync(destination, content, "utf8");
        written.push(relative);
      }
    }
    verifyKnowledgeBundle({ bundleDir: stageDir, packageJsonPath });
    if (existsSync(outDir)) renameSync(outDir, backupDir);
    try {
      renameSync(stageDir, outDir);
    } catch (error) {
      if (existsSync(backupDir)) renameSync(backupDir, outDir);
      throw error;
    }
    rmSync(backupDir, { recursive: true, force: true });
  } catch (error) {
    rmSync(stageDir, { recursive: true, force: true });
    if (existsSync(backupDir) && !existsSync(outDir)) renameSync(backupDir, outDir);
    throw new KnowledgeBundleWriteError(
      `Knowledge bundle reconciliation failed for ${outDir}: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }

  return { removed, unchanged: unchanged.sort(), written: written.sort() };
}
