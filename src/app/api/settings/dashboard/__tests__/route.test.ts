import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@/lib/settings/helpers", () => ({
  getSetting: vi.fn(async (key: string) => store.get(key) ?? null),
  setSetting: vi.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteSetting: vi.fn(async (key: string) => {
    store.delete(key);
  }),
}));

import { DELETE, GET, POST } from "../route";

describe("dashboard settings API", () => {
  beforeEach(() => store.clear());

  it("returns defaults and persists a strict partial visibility map", async () => {
    expect(await (await GET()).json()).toEqual({
      version: 1,
      smartOrdering: true,
      visible: {},
    });

    const response = await POST(
      new Request("http://localhost/api/settings/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          smartOrdering: false,
          visible: { activity: false, workshop: true },
        }),
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      smartOrdering: false,
      visible: { activity: false, workshop: true },
    });
  });

  it("rejects malformed or unknown module preferences", async () => {
    const response = await POST(
      new Request("http://localhost/api/settings/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          smartOrdering: true,
          visible: { attention: true, invented: false },
        }),
      })
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Invalid dashboard preferences"
    );
  });

  it("restores registry defaults", async () => {
    await POST(
      new Request("http://localhost/api/settings/dashboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: 1,
          smartOrdering: false,
          visible: { attention: false },
        }),
      })
    );
    const response = await DELETE();
    expect(await response.json()).toEqual({
      version: 1,
      smartOrdering: true,
      visible: {},
    });
  });
});
