import { describe, it, expect } from "vitest";
// The pure diff logic lives in the publish-gate script so the CI smoke and a
// standalone `node scripts/check-price-drift.mjs` run the SAME comparison.
// These tests import its side-effect-free exports directly (the CLI entry only
// runs under `import.meta.url === argv[1]`, never on import).
import {
  canonicalDisplay,
  diffPrice,
} from "../../../../scripts/check-price-drift.mjs";

// A canonical pricing.json shaped like the live one at
// https://orionfold.com/relay/pricing.json (2026-07-02).
const CANON_OPEN = {
  prices: {
    founding: { display: "$349", per: "year" },
    list: { display: "$499", per: "year" },
    renewal: { display: "$149", per: "year" },
  },
  founding_window: { state: "open" },
};

describe("canonicalDisplay", () => {
  it("joins display + per into the pack's concatenated form", () => {
    expect(canonicalDisplay({ display: "$349", per: "year" })).toBe("$349/year");
  });

  it("returns null for a missing or incomplete entry", () => {
    expect(canonicalDisplay(undefined)).toBeNull();
    expect(canonicalDisplay({ display: "$349" })).toBeNull();
    expect(canonicalDisplay({ per: "year" })).toBeNull();
  });
});

describe("diffPrice — founding window OPEN", () => {
  it("no drift when pack matches the canon", () => {
    const pack = { intro: "$349/year", list: "$499/year", note: "Founding price." };
    expect(diffPrice(pack, CANON_OPEN)).toEqual([]);
  });

  it("flags a list-price mismatch", () => {
    const pack = { intro: "$349/year", list: "$599/year" };
    const findings = diffPrice(pack, CANON_OPEN);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("list price drift");
    expect(findings[0]).toContain("$599/year");
    expect(findings[0]).toContain("$499/year");
  });

  it("flags a founding/intro-price mismatch", () => {
    const pack = { intro: "$399/year", list: "$499/year" };
    const findings = diffPrice(pack, CANON_OPEN);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("founding price drift");
    expect(findings[0]).toContain("$399/year");
  });

  it("flags an invisible founding offer (window open, pack has no intro)", () => {
    const pack = { list: "$499/year" };
    const findings = diffPrice(pack, CANON_OPEN);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("invisible on the locked card");
  });

  it("reports both list and founding drift together", () => {
    const pack = { intro: "$399/year", list: "$599/year" };
    expect(diffPrice(pack, CANON_OPEN)).toHaveLength(2);
  });
});

describe("diffPrice — founding window CLOSED", () => {
  const CANON_CLOSED = {
    prices: { list: { display: "$499", per: "year" }, founding: { display: "$349", per: "year" } },
    founding_window: { state: "closed" },
  };

  it("no drift when the pack has dropped intro to just the list price", () => {
    const pack = { list: "$499/year" };
    expect(diffPrice(pack, CANON_CLOSED)).toEqual([]);
  });

  it("flags a stale founding price left on the pack after the window closed", () => {
    const pack = { intro: "$349/year", list: "$499/year", note: "Founding price." };
    const findings = diffPrice(pack, CANON_CLOSED);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("still carries intro");
    expect(findings[0]).toContain("closed");
  });
});

describe("diffPrice — degraded canon", () => {
  it("reports when the canonical list price is missing (cannot verify)", () => {
    const pack = { list: "$499/year" };
    const findings = diffPrice(pack, { prices: {}, founding_window: { state: "closed" } });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("canonical prices.list missing");
  });

  it("treats an absent founding_window as not-open (no intro allowed)", () => {
    const pack = { intro: "$349/year", list: "$499/year" };
    const canon = { prices: { list: { display: "$499", per: "year" } } };
    const findings = diffPrice(pack, canon);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toContain("still carries intro");
  });
});
