import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSelfBaseUrl } from "@/lib/http/self-base-url";

/**
 * Regression guard for issue #29: self-call origin must derive from the real
 * bind port, never a bare :3000. NOTE: this pure test asserts the precedence
 * logic only — it CANNOT prove a real socket is reachable (fetch is mocked in
 * the suites that call getBaseUrl). The non-3000 launch smoke in the fix spec
 * is the real gate; see CLAUDE.md smoke-budget rule.
 */
describe("getSelfBaseUrl", () => {
  const KEYS = [
    "RELAY_SELF_BASE_URL",
    "NEXTAUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "PORT",
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("falls back to loopback + the real PORT, not :3000", () => {
    process.env.PORT = "3199";
    expect(getSelfBaseUrl()).toBe("http://127.0.0.1:3199");
  });

  it("uses 127.0.0.1:3000 only when no PORT is set", () => {
    expect(getSelfBaseUrl()).toBe("http://127.0.0.1:3000");
  });

  it("prefers RELAY_SELF_BASE_URL over everything", () => {
    process.env.RELAY_SELF_BASE_URL = "http://127.0.0.1:8080";
    process.env.NEXTAUTH_URL = "https://proxy.example";
    process.env.PORT = "3199";
    expect(getSelfBaseUrl()).toBe("http://127.0.0.1:8080");
  });

  it("honors NEXTAUTH_URL / NEXT_PUBLIC_APP_URL reverse-proxy overrides", () => {
    process.env.NEXTAUTH_URL = "https://relay.acme.internal";
    process.env.PORT = "3199";
    expect(getSelfBaseUrl()).toBe("https://relay.acme.internal");

    delete process.env.NEXTAUTH_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://relay.acme.internal:9000";
    expect(getSelfBaseUrl()).toBe("https://relay.acme.internal:9000");
  });
});
