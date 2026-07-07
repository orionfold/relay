import { rmSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getAinativeDataDir } from "@/lib/utils/ainative-paths";
import { storePreviewArtifact } from "@/lib/publishers/preview-store";
import { GET } from "../route";

function req(path: string) {
  return new Request(path, { method: "GET" }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  rmSync(join(getAinativeDataDir(), "previews"), { recursive: true, force: true });
});

describe("GET /api/apps/[id]/previews/[artifactId]/[[...path]]", () => {
  it("serves the preview entry point with defensive headers", async () => {
    const metadata = await storePreviewArtifact({
      appId: "app-1",
      generatorType: "static-site",
      sourceTable: "web-sections",
      sourceFingerprint: "fingerprint-1",
      artifact: {
        entryPoint: "index.html",
        hash: "hash-1",
        files: [{ path: "index.html", content: "<!doctype html><title>Preview</title>" }],
      },
    });

    const res = await GET(
      req(`http://localhost/api/apps/app-1/previews/${metadata.artifactId}`),
      {
        params: Promise.resolve({
          id: "app-1",
          artifactId: metadata.artifactId,
        }),
      }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(await res.text()).toContain("Preview");
  });

  it("rejects traversal and cross-app access", async () => {
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

    const traversal = await GET(req("http://localhost/bad"), {
      params: Promise.resolve({
        id: "app-1",
        artifactId: metadata.artifactId,
        path: ["..", "meta.json"],
      }),
    });
    expect(traversal.status).toBe(400);
    expect(await traversal.json()).toMatchObject({ code: "PREVIEW_PATH_INVALID" });

    const crossApp = await GET(req("http://localhost/bad"), {
      params: Promise.resolve({
        id: "app-2",
        artifactId: metadata.artifactId,
      }),
    });
    expect(crossApp.status).toBe(400);
    expect(await crossApp.json()).toMatchObject({ code: "PREVIEW_APP_MISMATCH" });
  });
});
