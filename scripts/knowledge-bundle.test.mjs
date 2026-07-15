import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  createKnowledgeArtifact,
  canonicalPublicUrl,
  KnowledgeBundleIntegrityError,
  KnowledgeBundleSchemaError,
  KnowledgeBundleVersionError,
  KnowledgeBundleWriteError,
  KnowledgeSourceStaleError,
  reconcileKnowledgeBundle,
  stableJson,
  validateCanonicalPublicUrl,
  verifyKnowledgeBundle,
  verifyProductRouteTargets,
} from "./lib/knowledge-bundle.mjs";

function write(file, content) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function writeJson(file, value) {
  write(file, stableJson(value));
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "relay-knowledge-test-"));
  const assetsRoot = path.join(root, "assets");
  const bundleDir = path.join(root, "knowledge");
  const packageJsonPath = path.join(root, "package.json");
  writeJson(packageJsonPath, { name: "orionfold-relay", version: "1.2.3" });
  write(path.join(root, "src/app/packs/page.tsx"), "export default function Page() { return null; }\n");
  write(
    path.join(root, "src/app/settings/page.tsx"),
    'export default function Page() { return <><div id="settings-license" /><div id="settings-providers" /></>; }\n',
  );
  write(path.join(root, "src/app/tables/[id]/page.tsx"), "export default function Page() { return null; }\n");

  const screenshotPaths = [
    "light/packs/packs__desktop.png",
    "dark/packs/packs__desktop.png",
  ];
  for (const screenshot of screenshotPaths) {
    write(path.join(assetsRoot, "screenshots", screenshot), `PNG:${screenshot}`);
  }
  writeJson(path.join(assetsRoot, "screenshots/metadata/manifest.json"), {
    schemaVersion: 1,
    entries: screenshotPaths.map((screenshot) => ({
      id: "packs-gallery",
      path: screenshot,
      route: "/packs",
      theme: screenshot.startsWith("light") ? "light" : "dark",
      viewport: "desktop",
    })),
  });

  writeJson(path.join(assetsRoot, "docs/guide-tracker.json"), {
    schemaVersion: 1,
    guideVersion: "guide-v1",
    staleFeatures: [],
    chapters: [
      {
        id: "01-packs",
        title: "Use Packs",
        slug: "01-use-packs",
        dirty: false,
        summary: "Install and inspect a Pack.",
        features: ["Pack install"],
        journeys: ["operator"],
        screenshotTargets: ["packs-gallery"],
        sourceState: { featureHashes: { "Pack install": "feature-hash-a" } },
      },
    ],
  });
  write(
    path.join(assetsRoot, "docs/guides/01-use-packs.md"),
    `---\nid: 01-packs\ntitle: Use Packs\n---\n# Use Packs\n\n## Install A Pack\n\nOpen Packs and choose one operating kit.\n\n![Packs gallery](../../screenshots/light/packs/packs__desktop.png)\n\n## Check The Result\n\nOpen the installed app and inspect its parts.\n`,
  );

  writeJson(path.join(assetsRoot, "api/api-tracker.json"), {
    schemaVersion: 1,
    apiDocsVersion: "api-v1",
    staleEndpoints: [],
    unassignedEndpoints: [],
    groups: [
      {
        id: "01-packs-api",
        title: "Packs API",
        slug: "01-packs-api",
        dirty: false,
        stability: "app-internal",
        summary: "Local Pack endpoints.",
        endpoints: ["/api/packs"],
      },
    ],
    endpoints: [
      {
        path: "/api/packs",
        group: "01-packs-api",
        methods: ["GET"],
        stability: "app-internal",
        sourceFile: "src/app/api/packs/route.ts",
        sourceHash: "route-hash-a",
      },
    ],
  });
  write(
    path.join(assetsRoot, "api/reference/01-packs-api.md"),
    `---\nid: 01-packs-api\ntitle: Packs API\n---\n## GET /api/packs\n\nLists the Packs available to this local Relay instance.\n`,
  );
  return { assetsRoot, bundleDir, packageJsonPath, root };
}

function artifact(paths) {
  return createKnowledgeArtifact({
    assetsRoot: paths.assetsRoot,
    packageJsonPath: paths.packageJsonPath,
  });
}

function build(paths) {
  const result = reconcileKnowledgeBundle({
    files: artifact(paths).files,
    outDir: paths.bundleDir,
    packageJsonPath: paths.packageJsonPath,
  });
  return { result, verification: verifyKnowledgeBundle({
    bundleDir: paths.bundleDir,
    packageJsonPath: paths.packageJsonPath,
  }) };
}

test("builds a deterministic release-stamped bundle and writes zero files on unchanged input", () => {
  const paths = fixture();
  const first = build(paths);
  assert.equal(first.verification.releaseVersion, "1.2.3");
  assert.equal(first.verification.entries, 2);
  assert.ok(first.result.written.includes("entries/guide.01-packs.json"));
  const guide = JSON.parse(readFileSync(path.join(paths.bundleDir, "entries/guide.01-packs.json"), "utf8"));
  assert.deepEqual(guide.productRoutes, ["/packs"]);
  assert.equal(guide.publicUrl, "https://orionfold.com/relay/docs/use-packs/");
  const api = JSON.parse(readFileSync(path.join(paths.bundleDir, "entries/api.01-packs-api.json"), "utf8"));
  assert.equal(api.publicUrl, "https://orionfold.com/relay/api/01-packs-api/");
  assert.equal(guide.sections[0].markdown.includes("../../screenshots"), false);
  assert.equal(guide.sections[0].markdown.includes("[Figure: Packs gallery]"), true);

  const manifestBefore = readFileSync(path.join(paths.bundleDir, "manifest.json"), "utf8");
  const second = build(paths);
  assert.deepEqual(second.result.written, []);
  assert.deepEqual(second.result.removed, []);
  assert.equal(second.result.unchanged.length, 4);
  assert.equal(readFileSync(path.join(paths.bundleDir, "manifest.json"), "utf8"), manifestBefore);
  assert.equal(second.verification.bundleHash, first.verification.bundleHash);
});

test("accepts safe in-app fragments while refusing queries and malformed fragments", () => {
  const paths = fixture();
  const manifestPath = path.join(paths.assetsRoot, "screenshots/metadata/manifest.json");
  const screenshots = JSON.parse(readFileSync(manifestPath, "utf8"));
  screenshots.entries[0].route = "/settings#license";
  writeJson(manifestPath, screenshots);
  const guide = artifact(paths).entries.find(({ kind }) => kind === "guide");
  assert.deepEqual(guide.productRoutes, ["/packs", "/settings#settings-license"]);

  for (const route of ["/settings?panel=license", "/settings#license/details", "/settings#"]) {
    screenshots.entries[0].route = route;
    writeJson(manifestPath, screenshots);
    assert.throws(() => artifact(paths), KnowledgeBundleSchemaError);
  }
});

test("derives only canonical source URLs for each public documentation family", () => {
  assert.equal(
    canonicalPublicUrl("guide", "04-plan-work-with-chat-agents-and-runtimes"),
    "https://orionfold.com/relay/docs/plan-work-with-chat-agents-and-runtimes/",
  );
  assert.equal(
    canonicalPublicUrl("api", "03-agents-chat-runtimes"),
    "https://orionfold.com/relay/api/03-agents-chat-runtimes/",
  );
  assert.equal(
    validateCanonicalPublicUrl("https://orionfold.com/relay/docs/use-packs/", "guide"),
    "https://orionfold.com/relay/docs/use-packs/",
  );
  for (const [url, kind] of [
    ["http://orionfold.com/relay/docs/use-packs/", "guide"],
    ["https://www.orionfold.com/relay/docs/use-packs/", "guide"],
    ["https://orionfold.com/relay/api/01-packs-api/", "guide"],
    ["https://orionfold.com/relay/docs/use-packs/?next=trap", "guide"],
    ["https://orionfold.com/relay/docs/use-packs/#trap", "guide"],
  ]) {
    assert.throws(() => validateCanonicalPublicUrl(url, kind), KnowledgeBundleSchemaError);
  }
});

test("verifies static, dynamic, and fragment product-route targets", () => {
  const paths = fixture();
  assert.doesNotThrow(() => verifyProductRouteTargets([
    "/packs",
    "/tables/example",
    "/settings#settings-providers",
  ], paths.root));
  assert.throws(
    () => verifyProductRouteTargets(["/missing"], paths.root),
    /has no App Router page/,
  );
  assert.throws(
    () => verifyProductRouteTargets(["/settings#missing"], paths.root),
    /fragment #missing is absent/,
  );
  assert.throws(
    () => verifyProductRouteTargets(["/settings#runtime"], paths.root),
    /is not canonical/,
  );
});

test("a guide feature-state change rewrites only the mapped guide entry and aggregate files", () => {
  const paths = fixture();
  build(paths);
  const apiPath = path.join(paths.bundleDir, "entries/api.01-packs-api.json");
  const apiInode = statSync(apiPath).ino;
  const trackerPath = path.join(paths.assetsRoot, "docs/guide-tracker.json");
  const tracker = JSON.parse(readFileSync(trackerPath, "utf8"));
  tracker.chapters[0].sourceState.featureHashes["Pack install"] = "feature-hash-b";
  writeJson(trackerPath, tracker);

  const { result } = build(paths);
  assert.deepEqual(result.written, [
    "entries/guide.01-packs.json",
    "index.json",
    "manifest.json",
  ]);
  assert.equal(statSync(apiPath).ino, apiInode, "unmapped API entry retained its inode");
});

test("an API source-hash change rewrites only its owning API entry and aggregate files", () => {
  const paths = fixture();
  build(paths);
  const guidePath = path.join(paths.bundleDir, "entries/guide.01-packs.json");
  const guideInode = statSync(guidePath).ino;
  const trackerPath = path.join(paths.assetsRoot, "api/api-tracker.json");
  const tracker = JSON.parse(readFileSync(trackerPath, "utf8"));
  tracker.endpoints[0].sourceHash = "route-hash-b";
  writeJson(trackerPath, tracker);

  const { result } = build(paths);
  assert.deepEqual(result.written, [
    "entries/api.01-packs-api.json",
    "index.json",
    "manifest.json",
  ]);
  assert.equal(statSync(guidePath).ino, guideInode, "unmapped guide entry retained its inode");
});

test("dirty source state fails before replacing the last verified bundle", () => {
  const paths = fixture();
  build(paths);
  const manifestBefore = readFileSync(path.join(paths.bundleDir, "manifest.json"), "utf8");
  const trackerPath = path.join(paths.assetsRoot, "api/api-tracker.json");
  const tracker = JSON.parse(readFileSync(trackerPath, "utf8"));
  tracker.groups[0].dirty = true;
  writeJson(trackerPath, tracker);
  assert.throws(() => artifact(paths), KnowledgeSourceStaleError);
  assert.equal(readFileSync(path.join(paths.bundleDir, "manifest.json"), "utf8"), manifestBefore);
});

test("removes entries no longer declared by current trackers", () => {
  const paths = fixture();
  build(paths);
  const trackerPath = path.join(paths.assetsRoot, "api/api-tracker.json");
  const tracker = JSON.parse(readFileSync(trackerPath, "utf8"));
  tracker.groups = [];
  tracker.endpoints = [];
  writeJson(trackerPath, tracker);
  const { result, verification } = build(paths);
  assert.deepEqual(result.removed, ["entries/api.01-packs-api.json"]);
  assert.equal(verification.entries, 1);
});

test("refuses tampered entries, orphan files, and package-version mismatches", () => {
  const tampered = fixture();
  build(tampered);
  const entryPath = path.join(tampered.bundleDir, "entries/guide.01-packs.json");
  writeFileSync(entryPath, readFileSync(entryPath, "utf8").replace("Open Packs", "Tampered Packs"));
  assert.throws(
    () => verifyKnowledgeBundle({ bundleDir: tampered.bundleDir, packageJsonPath: tampered.packageJsonPath }),
    KnowledgeBundleIntegrityError,
  );

  const orphaned = fixture();
  build(orphaned);
  write(path.join(orphaned.bundleDir, "entries/orphan.json"), "{}\n");
  assert.throws(
    () => verifyKnowledgeBundle({ bundleDir: orphaned.bundleDir, packageJsonPath: orphaned.packageJsonPath }),
    KnowledgeBundleIntegrityError,
  );

  const mismatched = fixture();
  build(mismatched);
  writeJson(mismatched.packageJsonPath, { name: "orionfold-relay", version: "1.2.4" });
  assert.throws(
    () => verifyKnowledgeBundle({ bundleDir: mismatched.bundleDir, packageJsonPath: mismatched.packageJsonPath }),
    KnowledgeBundleVersionError,
  );

  const declarationDrift = fixture();
  build(declarationDrift);
  const declarationManifestPath = path.join(declarationDrift.bundleDir, "manifest.json");
  const declarationManifest = JSON.parse(readFileSync(declarationManifestPath, "utf8"));
  declarationManifest.entries[0].sourceHash = "0".repeat(64);
  writeJson(declarationManifestPath, declarationManifest);
  assert.throws(
    () => verifyKnowledgeBundle({
      bundleDir: declarationDrift.bundleDir,
      packageJsonPath: declarationDrift.packageJsonPath,
    }),
    KnowledgeBundleIntegrityError,
  );

  const malformed = fixture();
  build(malformed);
  write(path.join(malformed.bundleDir, "entries/guide.01-packs.json"), "{not-json}\n");
  assert.throws(
    () => verifyKnowledgeBundle({ bundleDir: malformed.bundleDir, packageJsonPath: malformed.packageJsonPath }),
    KnowledgeBundleSchemaError,
  );

  const missing = fixture();
  build(missing);
  unlinkSync(path.join(missing.bundleDir, "entries/guide.01-packs.json"));
  assert.throws(
    () => verifyKnowledgeBundle({ bundleDir: missing.bundleDir, packageJsonPath: missing.packageJsonPath }),
    KnowledgeBundleSchemaError,
  );
});

test("rejects unsafe product routes and private source material with named failures", () => {
  const unsafe = fixture();
  const manifestPath = path.join(unsafe.assetsRoot, "screenshots/metadata/manifest.json");
  const screenshots = JSON.parse(readFileSync(manifestPath, "utf8"));
  screenshots.entries[0].route = "https://example.com/packs";
  writeJson(manifestPath, screenshots);
  assert.throws(() => artifact(unsafe), KnowledgeBundleSchemaError);

  const traversal = fixture();
  const traversalManifestPath = path.join(traversal.assetsRoot, "screenshots/metadata/manifest.json");
  const traversalScreenshots = JSON.parse(readFileSync(traversalManifestPath, "utf8"));
  traversalScreenshots.entries[0].path = "../../package.json";
  writeJson(traversalManifestPath, traversalScreenshots);
  assert.throws(() => artifact(traversal), KnowledgeBundleSchemaError);

  const privateSource = fixture();
  const guidePath = path.join(privateSource.assetsRoot, "docs/guides/01-use-packs.md");
  writeFileSync(guidePath, `${readFileSync(guidePath, "utf8")}\nPrivate: /Users/alice/orionfold/strategy\n`);
  assert.throws(
    () => reconcileKnowledgeBundle({
      files: artifact(privateSource).files,
      outDir: privateSource.bundleDir,
      packageJsonPath: privateSource.packageJsonPath,
    }),
    (error) =>
      error instanceof KnowledgeBundleWriteError &&
      error.cause instanceof KnowledgeBundleIntegrityError,
  );
});
