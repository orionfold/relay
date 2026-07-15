/** Public, package-local knowledge artifact contract produced by G-054. */
export const RELAY_KNOWLEDGE_SCHEMA_VERSION = 1 as const;

export type RelayKnowledgeKind = "guide" | "api";

export interface RelayKnowledgeScreenshot {
  id: string;
  path: string;
  productRoute: string;
  sha256: string;
  theme?: string;
  viewport?: string;
}

export interface RelayKnowledgeSection {
  id: string;
  heading: string;
  level: number;
  markdown: string;
  wordCount: number;
}

export interface RelayKnowledgeEntry {
  schemaVersion: typeof RELAY_KNOWLEDGE_SCHEMA_VERSION;
  id: string;
  kind: RelayKnowledgeKind;
  title: string;
  summary: string;
  sourcePath: string;
  sourceHash: string;
  sourceStateHash: string;
  contentHash: string;
  features: string[];
  journeys: string[];
  apiPaths: string[];
  productRoutes: string[];
  screenshots: RelayKnowledgeScreenshot[];
  sections: RelayKnowledgeSection[];
  stability?: string;
}

export interface RelayKnowledgeIndexSection {
  sourceId: string;
  sectionId: string;
  kind: RelayKnowledgeKind;
  title: string;
  heading: string;
  ordinal: number;
  wordCount: number;
  searchTerms: string[];
  apiPaths: string[];
  productRoutes: string[];
  entryContentHash: string;
  sourceStateHash: string;
}

export interface RelayKnowledgeIndex {
  schemaVersion: typeof RELAY_KNOWLEDGE_SCHEMA_VERSION;
  sections: RelayKnowledgeIndexSection[];
}

export interface RelayKnowledgeManifestEntry {
  id: string;
  kind: RelayKnowledgeKind;
  title: string;
  path: string;
  sourceHash: string;
  sourceStateHash: string;
  contentHash: string;
}

export interface RelayKnowledgeManifest {
  schemaVersion: typeof RELAY_KNOWLEDGE_SCHEMA_VERSION;
  releaseVersion: string;
  bundleHash: string;
  sourceBundleHash: string;
  indexHash: string;
  entryCount: number;
  sectionCount: number;
  corpus: {
    guideVersion: string;
    apiDocsVersion: string;
    guideTrackerHash: string;
    apiTrackerHash: string;
    screenshotManifestHash: string;
  };
  entries: RelayKnowledgeManifestEntry[];
}

/**
 * G-055 boundary: callers verify the manifest before selecting bounded index
 * records and loading only their declared entry files. These types intentionally
 * expose no retrieval, prompt, network, or UI behavior.
 */
export interface RelayKnowledgeSelection {
  manifest: RelayKnowledgeManifest;
  index: RelayKnowledgeIndex;
  selected: RelayKnowledgeIndexSection[];
}
