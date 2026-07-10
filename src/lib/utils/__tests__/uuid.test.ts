import { afterEach, describe, expect, it, vi } from "vitest";
import { randomId } from "../uuid";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses native crypto.randomUUID when available (secure context / Node)", () => {
    const spy = vi.fn(() => "11111111-2222-4333-8444-555555555555");
    vi.stubGlobal("crypto", { randomUUID: spy, getRandomValues: vi.fn() });

    const id = randomId();

    expect(spy).toHaveBeenCalledOnce();
    expect(id).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("falls back to getRandomValues in a NON-secure context where randomUUID is undefined (issue #44)", () => {
    // This is the plain-HTTP remote-VM condition: randomUUID gone, but
    // getRandomValues still present. Must NOT throw.
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = i * 7 + 1;
      return arr;
    });
    vi.stubGlobal("crypto", { getRandomValues }); // note: no randomUUID

    const id = randomId();

    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(id).toMatch(UUID_RE);
    // Version nibble must be 4, variant nibble must be 8-b regardless of input.
    expect(id[14]).toBe("4");
    expect(["8", "9", "a", "b"]).toContain(id[19]);
  });

  it("never throws even when Web Crypto is entirely absent", () => {
    vi.stubGlobal("crypto", undefined);

    const id = randomId();

    expect(id).toMatch(UUID_RE);
  });

  it("produces distinct ids across calls in the getRandomValues tier", () => {
    let counter = 0;
    const getRandomValues = vi.fn((arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) arr[i] = (counter + i) % 256;
      counter += 37;
      return arr;
    });
    vi.stubGlobal("crypto", { getRandomValues });

    const a = randomId();
    const b = randomId();

    expect(a).not.toBe(b);
    expect(a).toMatch(UUID_RE);
    expect(b).toMatch(UUID_RE);
  });
});
