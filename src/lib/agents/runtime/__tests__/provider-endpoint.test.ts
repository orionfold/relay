// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  buildProviderRequestInit,
  isLoopbackHostname,
  joinProviderPath,
  normalizeProviderBaseUrl,
  ProviderEndpointConfigurationError,
  readBoundedProviderError,
} from "../provider-endpoint";

describe("provider endpoint URL policy", () => {
  it.each(["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]"])(
    "recognizes loopback host %s",
    (host) => expect(isLoopbackHostname(host)).toBe(true)
  );

  it("normalizes provider-specific default paths and preserves explicit paths", () => {
    expect(
      normalizeProviderBaseUrl("http://localhost:11434/", {
        label: "Ollama",
        allowInsecureRemote: false,
        defaultPath: "",
      })
    ).toBe("http://localhost:11434");
    expect(
      normalizeProviderBaseUrl("http://localhost:4000", {
        label: "LiteLLM",
        allowInsecureRemote: false,
        defaultPath: "/v1",
      })
    ).toBe("http://localhost:4000/v1");
    expect(
      normalizeProviderBaseUrl("https://example.test/proxy/v1/", {
        label: "LiteLLM",
        allowInsecureRemote: false,
        defaultPath: "/v1",
      })
    ).toBe("https://example.test/proxy/v1");
  });

  it.each([
    ["", "required"],
    ["not a url", "valid URL"],
    ["ftp://localhost/models", "http or https"],
    ["http://user:secret@localhost:11434", "must not contain credentials"],
    ["http://localhost:11434?token=secret", "query string or fragment"],
    ["http://localhost:11434#models", "query string or fragment"],
  ])("rejects %s", (value, message) => {
    expect(() =>
      normalizeProviderBaseUrl(value, {
        label: "Provider",
        allowInsecureRemote: false,
        defaultPath: "",
      })
    ).toThrow(message);
  });

  it("requires explicit remote-HTTP consent but accepts HTTPS", () => {
    expect(() =>
      normalizeProviderBaseUrl("http://ollama.lan:11434", {
        label: "Ollama",
        allowInsecureRemote: false,
        defaultPath: "",
      })
    ).toThrow(ProviderEndpointConfigurationError);
    expect(
      normalizeProviderBaseUrl("http://ollama.lan:11434", {
        label: "Ollama",
        allowInsecureRemote: true,
        defaultPath: "",
      })
    ).toBe("http://ollama.lan:11434");
    expect(
      normalizeProviderBaseUrl("https://ollama.example", {
        label: "Ollama",
        allowInsecureRemote: false,
        defaultPath: "",
      })
    ).toBe("https://ollama.example");
  });
});

describe("provider request policy", () => {
  it("adds Bearer auth, preserves falsey header values, and refuses redirects", () => {
    const controller = new AbortController();
    const init = buildProviderRequestInit(
      "provider-key",
      {
        method: "POST",
        body: "{}",
        headers: { "X-Retry-Count": "0" },
        signal: controller.signal,
      },
      50
    );
    const headers = new Headers(init.headers);
    expect(init).toMatchObject({
      method: "POST",
      body: "{}",
      signal: controller.signal,
      redirect: "manual",
    });
    expect(headers.get("Authorization")).toBe("Bearer provider-key");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Retry-Count")).toBe("0");
  });

  it("does not overwrite an explicit Authorization header", () => {
    const init = buildProviderRequestInit("provider-key", {
      headers: { Authorization: "Custom signed-token" },
    });
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Custom signed-token"
    );
  });

  it("joins paths without duplicate separators", () => {
    expect(joinProviderPath("http://localhost:11434/", "/api/tags")).toBe(
      "http://localhost:11434/api/tags"
    );
  });

  it("extracts structured failures and bounds plain-text errors", async () => {
    await expect(
      readBoundedProviderError(
        Response.json({ error: { message: "invalid token" } }, { status: 401 })
      )
    ).resolves.toBe("invalid token");
    await expect(
      readBoundedProviderError(new Response("x".repeat(700), { status: 502 }))
    ).resolves.toHaveLength(500);
  });

  it("redacts configured secrets from bounded provider errors", async () => {
    await expect(
      readBoundedProviderError(
        Response.json(
          { error: { message: "Authorization Bearer provider-secret failed" } },
          { status: 401 }
        ),
        500,
        ["provider-secret"]
      )
    ).resolves.toBe("Authorization Bearer [redacted] failed");
  });
});
