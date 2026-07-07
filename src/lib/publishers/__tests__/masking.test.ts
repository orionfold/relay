import { describe, expect, it } from "vitest";
import { maskPublishConfig, maskPublishTarget } from "../types";

// All secret values below are guard-safe placeholders (example-* prefix),
// never real credential material.
describe("maskPublishConfig", () => {
  it("masks every sensitive key to ****<last4>", () => {
    const config = JSON.stringify({
      token: "example-tk-1234",
      githubToken: "example-gh-5678",
      apiKey: "example-ak-9012",
    });

    const masked = JSON.parse(maskPublishConfig(config)) as Record<string, string>;
    expect(masked.token).toBe("****1234");
    expect(masked.githubToken).toBe("****5678");
    expect(masked.apiKey).toBe("****9012");
  });

  it("leaves non-secret fields untouched", () => {
    const config = JSON.stringify({
      owner: "acme",
      repo: "acme-site",
      branch: "gh-pages",
      githubToken: "example-gh-1234",
    });

    const masked = JSON.parse(maskPublishConfig(config)) as Record<string, string>;
    expect(masked.owner).toBe("acme");
    expect(masked.repo).toBe("acme-site");
    expect(masked.branch).toBe("gh-pages");
    expect(masked.githubToken).toBe("****1234");
  });

  it("returns the input unchanged on malformed JSON", () => {
    expect(maskPublishConfig("not json {")).toBe("not json {");
  });

  it("skips empty and non-string secret values", () => {
    const config = JSON.stringify({ token: "", apiKey: 42 });
    const masked = JSON.parse(maskPublishConfig(config)) as Record<string, unknown>;
    expect(masked.token).toBe("");
    expect(masked.apiKey).toBe(42);
  });
});

describe("maskPublishTarget", () => {
  it("masks the config field and preserves the rest of the row", () => {
    const row = {
      id: "pt-1",
      appId: "app-1",
      targetType: "github-pages",
      config: JSON.stringify({ owner: "acme", githubToken: "example-gh-1234" }),
      createdAt: new Date(0),
    };

    const masked = maskPublishTarget(row);
    expect(masked.id).toBe("pt-1");
    expect(masked.appId).toBe("app-1");
    expect(masked.targetType).toBe("github-pages");
    expect(masked.createdAt).toEqual(new Date(0));
    const parsed = JSON.parse(masked.config) as Record<string, string>;
    expect(parsed.owner).toBe("acme");
    expect(parsed.githubToken).toBe("****1234");
  });
});
