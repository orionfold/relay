import { afterEach, beforeEach, describe, expect, it } from "vitest";

const ORIGINAL = process.env.RELAY_CHAT_BRANCHING;

describe("GET /api/chat/branching/flag", () => {
  beforeEach(() => {
    delete process.env.RELAY_CHAT_BRANCHING;
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.RELAY_CHAT_BRANCHING;
    else process.env.RELAY_CHAT_BRANCHING = ORIGINAL;
  });

  it("returns enabled:false when env unset", async () => {
    const { GET } = await import("../route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ enabled: false });
  });

  it("returns enabled:true when env is exactly 'true'", async () => {
    process.env.RELAY_CHAT_BRANCHING = "true";
    const { GET } = await import("../route");
    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ enabled: true });
  });

  it("returns enabled:false for truthy variants ('1', 'yes')", async () => {
    process.env.RELAY_CHAT_BRANCHING = "1";
    const mod = await import("../route");
    const res = await mod.GET();
    const body = await res.json();
    expect(body.enabled).toBe(false);
  });
});
