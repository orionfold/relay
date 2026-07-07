import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubPagesAdapter } from "../github-pages-adapter";
import type { Artifact } from "../types";

// Guard-safe placeholder credential — never real material.
const TOKEN = "example-gh-token";

const config = {
  owner: "acme",
  repo: "acme-site",
  githubToken: TOKEN,
};

const artifact: Artifact = {
  files: [
    { path: "index.html", content: "<h1>hi</h1>" },
    { path: "css/site.css", content: "body{}" },
  ],
  entryPoint: "index.html",
  hash: "abc123",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("githubPagesAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("declares the github-pages target type", () => {
    expect(githubPagesAdapter.targetType).toBe("github-pages");
  });

  describe("testConnection", () => {
    it("returns ok on a reachable, authorized repo", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          full_name: "acme/acme-site",
          permissions: { push: true },
        })
      );

      const result = await githubPagesAdapter.testConnection(config);

      expect(result).toEqual({ ok: true });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.github.com/repos/acme/acme-site");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`
      );
    });

    it("fails visibly when the token cannot write repository contents", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, {
          full_name: "acme/acme-site",
          permissions: { push: false },
        })
      );

      const result = await githubPagesAdapter.testConnection(config);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Contents: Read and write");
    });

    it("returns ok:false with the status on auth failure", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: "Bad credentials" }));

      const result = await githubPagesAdapter.testConnection(config);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("401");
    });

    it("returns ok:false when required config fields are missing", async () => {
      const result = await githubPagesAdapter.testConnection({ owner: "acme" });

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("publish", () => {
    it("PUTs every file to the Contents API on the gh-pages branch", async () => {
      // Per file: GET existing sha (404 = new file), then PUT.
      fetchMock
        .mockResolvedValueOnce(jsonResponse(404, { message: "Not Found" }))
        .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
        .mockResolvedValueOnce(jsonResponse(404, { message: "Not Found" }))
        .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c2" } }));

      const result = await githubPagesAdapter.publish(artifact, config);

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://acme.github.io/acme-site/");
      expect(result.commit).toBe("c2");

      const putCalls = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit).method === "PUT"
      );
      expect(putCalls).toHaveLength(2);

      const [url, init] = putCalls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.github.com/repos/acme/acme-site/contents/index.html"
      );
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body.branch).toBe("gh-pages");
      expect(body.content).toBe(Buffer.from("<h1>hi</h1>").toString("base64"));
      expect(body.sha).toBeUndefined();

      const [url2] = putCalls[1] as [string, RequestInit];
      expect(url2).toBe(
        "https://api.github.com/repos/acme/acme-site/contents/css/site.css"
      );
    });

    it("includes the existing file sha when updating", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { sha: "old-sha" }))
        .mockResolvedValueOnce(jsonResponse(200, { commit: { sha: "c1" } }));

      const oneFile: Artifact = { ...artifact, files: [artifact.files[0]] };
      const result = await githubPagesAdapter.publish(oneFile, config);

      expect(result.success).toBe(true);
      const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(putInit.body as string) as Record<string, unknown>;
      expect(body.sha).toBe("old-sha");
    });

    it("returns a failed result naming the file when a PUT fails", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(404, { message: "Not Found" }))
        .mockResolvedValueOnce(jsonResponse(422, { message: "Validation Failed" }));

      const result = await githubPagesAdapter.publish(artifact, config);

      expect(result.success).toBe(false);
      expect(result.error).toContain("index.html");
      expect(result.error).toContain("422");
      // Stops at the first failure — no attempt on the second file.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns a failed result when required config fields are missing", async () => {
      const result = await githubPagesAdapter.publish(artifact, { repo: "acme-site" });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("honors a custom branch from config", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(404, { message: "Not Found" }))
        .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }));

      const oneFile: Artifact = { ...artifact, files: [artifact.files[0]] };
      await githubPagesAdapter.publish(oneFile, { ...config, branch: "main" });

      const [getUrl] = fetchMock.mock.calls[0] as [string];
      expect(getUrl).toContain("ref=main");
      const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
      const body = JSON.parse(putInit.body as string) as Record<string, unknown>;
      expect(body.branch).toBe("main");
    });

    it("returns a final URL when GitHub Pages redirects to a custom domain", async () => {
      const finalResponse = new Response(null, { status: 200 });
      Object.defineProperty(finalResponse, "url", {
        value: "https://www.acme.test/",
      });
      fetchMock
        .mockResolvedValueOnce(jsonResponse(404, { message: "Not Found" }))
        .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "c1" } }))
        .mockResolvedValueOnce(finalResponse);

      const oneFile: Artifact = { ...artifact, files: [artifact.files[0]] };
      const result = await githubPagesAdapter.publish(oneFile, config);

      expect(result.success).toBe(true);
      expect(result.url).toBe("https://acme.github.io/acme-site/");
      expect(result.finalUrl).toBe("https://www.acme.test/");
    });
  });
});
