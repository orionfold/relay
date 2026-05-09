import { describe, expect, it } from "vitest";
import { canonicalizeRowForHash, hashRowData } from "../row-hash";

describe("canonicalizeRowForHash", () => {
  it("produces a stable JSON string in column order regardless of input key order", () => {
    const cols = ["a", "b", "c"];
    const r1 = canonicalizeRowForHash({ b: "2", a: "1", c: "3" }, cols);
    const r2 = canonicalizeRowForHash({ c: "3", a: "1", b: "2" }, cols);
    expect(r1).toBe(r2);
    expect(r1).toBe('{"a":"1","b":"2","c":"3"}');
  });

  it("collapses null, undefined, and empty string to the same canonical empty", () => {
    const cols = ["a"];
    const sNull = canonicalizeRowForHash({ a: null }, cols);
    const sUndef = canonicalizeRowForHash({ a: undefined }, cols);
    const sEmpty = canonicalizeRowForHash({ a: "" }, cols);
    const sMissing = canonicalizeRowForHash({}, cols);
    expect(sNull).toBe(sEmpty);
    expect(sUndef).toBe(sEmpty);
    expect(sMissing).toBe(sEmpty);
  });

  it("ignores keys not in the column list (drops residue)", () => {
    const cols = ["a", "b"];
    const a = canonicalizeRowForHash({ a: "1", b: "2" }, cols);
    const b = canonicalizeRowForHash({ a: "1", b: "2", stray: "9" }, cols);
    expect(a).toBe(b);
  });

  it("does not case-fold values", () => {
    const cols = ["a"];
    const lower = canonicalizeRowForHash({ a: "iphone" }, cols);
    const upper = canonicalizeRowForHash({ a: "iPhone" }, cols);
    expect(lower).not.toBe(upper);
  });

  it("stringifies non-string primitive values", () => {
    const cols = ["n", "b"];
    const s = canonicalizeRowForHash({ n: 42, b: true }, cols);
    expect(s).toBe('{"n":"42","b":"true"}');
  });
});

describe("hashRowData", () => {
  it("returns sha256 hex (64 chars, lowercase)", () => {
    const h = hashRowData({ a: "1" }, ["a"]);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes equal canonical forms to equal hashes", () => {
    const cols = ["a", "b"];
    const h1 = hashRowData({ a: null, b: "x" }, cols);
    const h2 = hashRowData({ a: "", b: "x" }, cols);
    expect(h1).toBe(h2);
  });

  it("hashes different canonical forms to different hashes", () => {
    const cols = ["a"];
    const h1 = hashRowData({ a: "1" }, cols);
    const h2 = hashRowData({ a: "2" }, cols);
    expect(h1).not.toBe(h2);
  });
});
