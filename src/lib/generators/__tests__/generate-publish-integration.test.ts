import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGeneratorAdapter } from "../registry";
import { getPublisherAdapter } from "@/lib/publishers/registry";

/**
 * TDR-039 Phase 2 end-to-end seam: real static-site generator output flows
 * through the real registries into the github-pages publisher (fetch mocked).
 * This is the demo-able generate → publish chain — no DB, no real egress.
 */

// Guard-safe placeholder credential — never real material.
const TOKEN = "example-gh-token";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("generate → publish integration", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("generates a landing page from rows and publishes it via github-pages", async () => {
    const generator = getGeneratorAdapter("static-site");
    const publisher = getPublisherAdapter("github-pages");

    const rows = [
      {
        kind: "hero",
        heading: "Ship faster with Relay",
        body: "Own your stack.",
        order: 1,
        status: "published",
        ctaLabel: "Get started",
        ctaUrl: "https://relay.example.com/start",
      },
      {
        kind: "features",
        heading: "Why teams switch",
        body: "Local-first. No lock-in.",
        order: 2,
        status: "published",
      },
      // A draft that must NOT appear in the published site.
      { kind: "text", heading: "SECRET UNRELEASED", order: 3, status: "draft" },
    ];

    const artifact = await generator.generate(rows, { siteTitle: "Relay" });

    // The generator produced a single valid, self-contained page…
    expect(artifact.files).toHaveLength(1);
    expect(artifact.entryPoint).toBe("index.html");
    const doc = String(artifact.files[0]!.content);
    expect(doc).toContain("Ship faster with Relay");
    expect(doc).toContain("Why teams switch");
    expect(doc).not.toContain("SECRET UNRELEASED"); // draft gate held end-to-end

    // …which publishes cleanly (GET sha → 404 new file, then PUT 201).
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { message: "Not Found" }))
      .mockResolvedValueOnce(jsonResponse(201, { commit: { sha: "deadbeef" } }));

    const result = await publisher.publish(artifact, {
      owner: "acme",
      repo: "acme-site",
      githubToken: TOKEN,
    });

    expect(result.success).toBe(true);
    expect(result.url).toBe("https://acme.github.io/acme-site/");
    expect(result.commit).toBe("deadbeef");

    // The exact bytes the generator emitted were the bytes PUT to the repo.
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const putBody = JSON.parse(putInit.body as string) as Record<string, unknown>;
    expect(putBody.content).toBe(Buffer.from(doc).toString("base64"));
    expect(putBody.branch).toBe("gh-pages");
  });
});
