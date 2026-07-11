import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { githubRepoAdapter } from "../github-repo-adapter";
import type { Artifact } from "../types";

const artifact: Artifact = {
  files: [
    { path: "pack.yaml", content: "id: community-pack\n" },
    { path: "base/manifest.yaml", content: "id: community-pack\nname: Community Pack\n" },
  ],
  entryPoint: "pack.yaml",
  hash: "abcdef1234567890",
};

const config = {
  owner: "acme",
  repo: "private-packs",
  branch: "main",
  directory: "packs/community-pack",
  githubToken: "example-token",
};

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("githubRepoAdapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("declares the github-repo target type", () => {
    expect(githubRepoAdapter.targetType).toBe("github-repo");
  });

  it("publishes one atomic commit and deletes only stale Relay-owned paths", async () => {
    const oldMarker = Buffer.from(
      JSON.stringify({ files: ["pack.yaml", "base/removed.yaml", "README.md"] })
    ).toString("base64");
    fetchMock
      .mockResolvedValueOnce(response(200, { default_branch: "main", permissions: { push: true } }))
      .mockResolvedValueOnce(response(200, { object: { sha: "base-commit" } }))
      .mockResolvedValueOnce(response(200, { tree: { sha: "base-tree" } }))
      .mockResolvedValueOnce(response(200, { tree: [
        { path: "packs/community-pack/pack.yaml" },
        { path: "packs/community-pack/base/removed.yaml" },
        { path: "packs/community-pack/README.md" },
      ] }))
      .mockResolvedValueOnce(response(200, { content: oldMarker }))
      .mockResolvedValueOnce(response(201, { sha: "blob-pack" }))
      .mockResolvedValueOnce(response(201, { sha: "blob-manifest" }))
      .mockResolvedValueOnce(response(201, { sha: "blob-marker" }))
      .mockResolvedValueOnce(response(201, { sha: "next-tree" }))
      .mockResolvedValueOnce(response(201, { sha: "next-commit" }))
      .mockResolvedValueOnce(response(200, { ref: "refs/heads/main" }));

    const result = await githubRepoAdapter.publish(artifact, config);

    expect(result).toMatchObject({
      success: true,
      commit: "next-commit",
      url: "https://github.com/acme/private-packs/tree/main/packs/community-pack",
    });
    const treeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/git/trees")
    ) as [string, RequestInit];
    const treeBody = JSON.parse(treeCall[1].body as string) as {
      base_tree: string;
      tree: Array<{ path: string; sha: string | null }>;
    };
    expect(treeBody.base_tree).toBe("base-tree");
    expect(treeBody.tree).toContainEqual(
      expect.objectContaining({
        path: "packs/community-pack/base/removed.yaml",
        sha: null,
      })
    );
    expect(treeBody.tree.some((entry) => entry.path === "README.md")).toBe(false);
    expect(
      treeBody.tree.some((entry) => entry.path === "packs/community-pack/README.md")
    ).toBe(false);
    const refCall = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(refCall[1].method).toBe("PATCH");
    expect(JSON.parse(refCall[1].body as string)).toEqual({
      sha: "next-commit",
      force: false,
    });
  });

  it("refuses unsafe repository directories before any network call", async () => {
    const result = await githubRepoAdapter.publish(artifact, {
      ...config,
      directory: "../other",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("safe repository-relative path");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("initializes an empty repository through the documented Contents API bootstrap", async () => {
    fetchMock
      .mockResolvedValueOnce(response(200, { default_branch: "main", permissions: { push: true } }))
      .mockResolvedValueOnce(response(409, { message: "Git Repository is empty." }))
      .mockResolvedValueOnce(response(201, { commit: { sha: "init-commit" } }))
      .mockResolvedValueOnce(response(200, { tree: { sha: "init-tree" } }))
      .mockResolvedValueOnce(response(200, { tree: [{ path: ".relay-pack-init" }] }))
      .mockResolvedValueOnce(response(404, { message: "Not Found" }))
      .mockResolvedValueOnce(response(201, { sha: "blob-pack" }))
      .mockResolvedValueOnce(response(201, { sha: "blob-manifest" }))
      .mockResolvedValueOnce(response(201, { sha: "blob-marker" }))
      .mockResolvedValueOnce(response(201, { sha: "pack-tree" }))
      .mockResolvedValueOnce(response(201, { sha: "pack-commit" }))
      .mockResolvedValueOnce(response(200, { ref: "refs/heads/main" }));

    const result = await githubRepoAdapter.publish(artifact, {
      ...config,
      directory: "",
    });

    expect(result.success).toBe(true);
    const initCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/contents/.relay-pack-init")
    ) as [string, RequestInit];
    expect(initCall[1].method).toBe("PUT");
    const treeCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/git/trees")
    ) as [string, RequestInit];
    const tree = JSON.parse(treeCall[1].body as string) as {
      tree: Array<{ path: string; sha: string | null }>;
    };
    expect(tree.tree).toContainEqual(
      expect.objectContaining({ path: ".relay-pack-init", sha: null })
    );
  });

  it("surfaces missing write permission", async () => {
    fetchMock.mockResolvedValueOnce(
      response(200, {
        name: "pack",
        full_name: "acme/pack",
        private: true,
        default_branch: "main",
        owner: { login: "acme" },
        permissions: { push: false },
      })
    );
    const result = await githubRepoAdapter.testConnection(config);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Contents: Read and write");
  });

  it("rejects non-pack artifact paths before network egress", async () => {
    const result = await githubRepoAdapter.publish(
      {
        ...artifact,
        files: [...artifact.files, { path: ".github/workflows/exfiltrate.yml", content: "x" }],
      },
      config
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("only a Relay Pack artifact");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
