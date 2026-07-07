import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Artifact, ArtifactFile } from "@/lib/publishers/types";
import { getAinativeDataDir } from "@/lib/utils/ainative-paths";

export const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;

export type PreviewArtifactMetadata = {
  artifactId: string;
  appId: string;
  generatorType: string;
  sourceTable: string;
  hash: string;
  entryPoint: string;
  createdAt: string;
  expiresAt: string;
  sourceFingerprint: string;
  files: Array<{ path: string; sha256: string }>;
};

export type StoredPreviewArtifact = {
  metadata: PreviewArtifactMetadata;
  artifact: Artifact;
};

export type PreviewFile = {
  content: Buffer;
  path: string;
  contentType: string;
};

export class PreviewStoreError extends Error {
  readonly code:
    | "PREVIEW_NOT_FOUND"
    | "PREVIEW_EXPIRED"
    | "PREVIEW_APP_MISMATCH"
    | "PREVIEW_HASH_INVALID"
    | "PREVIEW_PATH_INVALID";

  constructor(code: PreviewStoreError["code"], message: string) {
    super(message);
    this.name = "PreviewStoreError";
    this.code = code;
  }
}

function previewsDir(): string {
  return path.join(getAinativeDataDir(), "previews");
}

function previewDir(artifactId: string): string {
  return path.join(previewsDir(), artifactId);
}

function filesDir(artifactId: string): string {
  return path.join(previewDir(artifactId), "files");
}

function metadataPath(artifactId: string): string {
  return path.join(previewDir(artifactId), "meta.json");
}

function cleanArtifactPath(input: string): string {
  const normalized = input.replace(/\\/g, "/");
  if (
    normalized === "" ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new PreviewStoreError("PREVIEW_PATH_INVALID", "Preview file path is invalid");
  }

  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new PreviewStoreError("PREVIEW_PATH_INVALID", "Preview file path is invalid");
  }
  return parts.join("/");
}

function fileDigest(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function artifactFilePath(artifactId: string, filePath: string): string {
  return path.join(filesDir(artifactId), ...cleanArtifactPath(filePath).split("/"));
}

async function readMetadata(artifactId: string): Promise<PreviewArtifactMetadata> {
  try {
    const raw = await readFile(metadataPath(artifactId), "utf8");
    const parsed = JSON.parse(raw) as PreviewArtifactMetadata;
    if (!parsed || typeof parsed !== "object" || parsed.artifactId !== artifactId) {
      throw new Error("metadata does not match artifact");
    }
    return parsed;
  } catch (err) {
    if (err instanceof PreviewStoreError) throw err;
    throw new PreviewStoreError(
      "PREVIEW_NOT_FOUND",
      `Preview artifact not found: ${artifactId}`
    );
  }
}

function assertMetadataUsable(
  metadata: PreviewArtifactMetadata,
  appId: string,
  now = new Date()
) {
  if (metadata.appId !== appId) {
    throw new PreviewStoreError(
      "PREVIEW_APP_MISMATCH",
      "Preview artifact does not belong to this app"
    );
  }
  if (new Date(metadata.expiresAt).getTime() <= now.getTime()) {
    throw new PreviewStoreError(
      "PREVIEW_EXPIRED",
      "Preview artifact has expired; generate a new preview"
    );
  }
}

export async function cleanupExpiredPreviews(now = new Date()): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(previewsDir());
  } catch {
    return;
  }

  await Promise.all(
    entries.map(async (entry) => {
      const dir = previewDir(entry);
      try {
        const s = await stat(dir);
        if (!s.isDirectory()) return;
        const metadata = await readMetadata(entry);
        if (new Date(metadata.expiresAt).getTime() <= now.getTime()) {
          await rm(dir, { recursive: true, force: true });
        }
      } catch {
        return;
      }
    })
  );
}

export async function storePreviewArtifact(input: {
  appId: string;
  generatorType: string;
  sourceTable: string;
  sourceFingerprint: string;
  artifact: Artifact;
  now?: Date;
}): Promise<PreviewArtifactMetadata> {
  await cleanupExpiredPreviews(input.now);

  const artifactId = randomUUID();
  const createdAt = input.now ?? new Date();
  const expiresAt = new Date(createdAt.getTime() + PREVIEW_TTL_MS);
  const root = filesDir(artifactId);
  await mkdir(root, { recursive: true });

  const files: PreviewArtifactMetadata["files"] = [];
  for (const file of input.artifact.files) {
    const cleaned = cleanArtifactPath(file.path);
    const targetPath = artifactFilePath(artifactId, cleaned);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content);
    files.push({ path: cleaned, sha256: fileDigest(file.content) });
  }

  const metadata: PreviewArtifactMetadata = {
    artifactId,
    appId: input.appId,
    generatorType: input.generatorType,
    sourceTable: input.sourceTable,
    hash: input.artifact.hash,
    entryPoint: cleanArtifactPath(input.artifact.entryPoint),
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    sourceFingerprint: input.sourceFingerprint,
    files,
  };
  await writeFile(metadataPath(artifactId), JSON.stringify(metadata, null, 2), "utf8");
  return metadata;
}

export async function loadPreviewArtifact(
  appId: string,
  artifactId: string
): Promise<StoredPreviewArtifact> {
  const metadata = await readMetadata(artifactId);
  assertMetadataUsable(metadata, appId);

  const files: ArtifactFile[] = [];
  for (const file of metadata.files) {
    const content = await readFile(artifactFilePath(artifactId, file.path));
    if (fileDigest(content) !== file.sha256) {
      throw new PreviewStoreError(
        "PREVIEW_HASH_INVALID",
        "Preview artifact file hash does not match metadata"
      );
    }
    files.push({ path: file.path, content });
  }

  return {
    metadata,
    artifact: {
      files,
      entryPoint: metadata.entryPoint,
      hash: metadata.hash,
    },
  };
}

function contentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
    case ".htm":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function loadPreviewFile(
  appId: string,
  artifactId: string,
  requestedPath: string[]
): Promise<PreviewFile> {
  const { metadata } = await loadPreviewArtifact(appId, artifactId);
  const relativePath =
    requestedPath.length === 0 ? metadata.entryPoint : cleanArtifactPath(requestedPath.join("/"));
  const file = metadata.files.find((candidate) => candidate.path === relativePath);
  if (!file) {
    throw new PreviewStoreError("PREVIEW_NOT_FOUND", "Preview file not found");
  }

  const content = await readFile(artifactFilePath(artifactId, relativePath));
  if (fileDigest(content) !== file.sha256) {
    throw new PreviewStoreError(
      "PREVIEW_HASH_INVALID",
      "Preview artifact file hash does not match metadata"
    );
  }
  return {
    content,
    path: relativePath,
    contentType: contentTypeForPath(relativePath),
  };
}
