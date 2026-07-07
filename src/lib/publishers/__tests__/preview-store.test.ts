import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getAinativeDataDir } from "@/lib/utils/ainative-paths";
import {
  loadPreviewArtifact,
  loadPreviewFile,
  PREVIEW_TTL_MS,
  storePreviewArtifact,
} from "../preview-store";

function resetPreviewsDir() {
  rmSync(join(getAinativeDataDir(), "previews"), { recursive: true, force: true });
}

beforeEach(() => {
  resetPreviewsDir();
});

describe("preview artifact store", () => {
  it("stores and serves the entry point plus nested files", async () => {
    const metadata = await storePreviewArtifact({
      appId: "app-1",
      generatorType: "static-site",
      sourceTable: "web-sections",
      sourceFingerprint: "fingerprint-1",
      artifact: {
        entryPoint: "index.html",
        hash: "hash-1",
        files: [
          { path: "index.html", content: "<!doctype html><title>Preview</title>" },
          { path: "assets/site.css", content: "body{margin:0}" },
        ],
      },
    });

    const index = await loadPreviewFile("app-1", metadata.artifactId, []);
    expect(index.contentType).toBe("text/html; charset=utf-8");
    expect(index.content.toString("utf8")).toContain("Preview");

    const css = await loadPreviewFile("app-1", metadata.artifactId, ["assets", "site.css"]);
    expect(css.contentType).toBe("text/css; charset=utf-8");
    expect(css.content.toString("utf8")).toBe("body{margin:0}");
  });

  it("blocks traversal and cross-app preview access", async () => {
    const metadata = await storePreviewArtifact({
      appId: "app-1",
      generatorType: "static-site",
      sourceTable: "web-sections",
      sourceFingerprint: "fingerprint-1",
      artifact: {
        entryPoint: "index.html",
        hash: "hash-1",
        files: [{ path: "index.html", content: "ok" }],
      },
    });

    await expect(
      loadPreviewFile("app-1", metadata.artifactId, ["..", "meta.json"])
    ).rejects.toMatchObject({ code: "PREVIEW_PATH_INVALID" });
    await expect(loadPreviewArtifact("app-2", metadata.artifactId)).rejects.toMatchObject({
      code: "PREVIEW_APP_MISMATCH",
    });
  });

  it("refuses expired and mutated preview artifacts", async () => {
    const old = new Date(Date.now() - PREVIEW_TTL_MS - 1000);
    const expired = await storePreviewArtifact({
      appId: "app-1",
      generatorType: "static-site",
      sourceTable: "web-sections",
      sourceFingerprint: "fingerprint-1",
      now: old,
      artifact: {
        entryPoint: "index.html",
        hash: "hash-1",
        files: [{ path: "index.html", content: "old" }],
      },
    });
    await expect(loadPreviewArtifact("app-1", expired.artifactId)).rejects.toMatchObject({
      code: "PREVIEW_EXPIRED",
    });

    const fresh = await storePreviewArtifact({
      appId: "app-1",
      generatorType: "static-site",
      sourceTable: "web-sections",
      sourceFingerprint: "fingerprint-1",
      artifact: {
        entryPoint: "index.html",
        hash: "hash-1",
        files: [{ path: "index.html", content: "fresh" }],
      },
    });
    const filePath = join(
      getAinativeDataDir(),
      "previews",
      fresh.artifactId,
      "files",
      "index.html"
    );
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, "tampered", "utf8");

    await expect(loadPreviewArtifact("app-1", fresh.artifactId)).rejects.toMatchObject({
      code: "PREVIEW_HASH_INVALID",
    });
  });
});
