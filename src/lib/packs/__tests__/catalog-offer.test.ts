import { describe, expect, it } from "vitest";
import type { PackTemplate } from "../catalog";
import {
  resolvePremiumCatalogOffer,
  summarizePackDecision,
} from "../catalog-offer";

function premium(
  id: string,
  overrides: Partial<NonNullable<PackTemplate["meta"]>> = {},
): PackTemplate {
  return {
    id,
    dir: `/tmp/${id}`,
    primitivesSummary: "2 profiles · 1 workflow",
    meta: {
      id,
      version: "1.0.0",
      name: `Pack ${id}`,
      description:
        "Run the core job. Choose this when the operating work needs a repeatable path. Everything installs offline.",
      entitlement: "product:orionfold-relay",
      price: { intro: "$349/year", list: "$499/year" },
      purchaseUrl: "https://orionfold.com/relay/",
      customers: [],
      ...overrides,
    },
  };
}

describe("premium catalog offer", () => {
  it("resolves one shared offer for every agreeing premium Pack", () => {
    const result = resolvePremiumCatalogOffer([
      premium("one"),
      premium("two"),
    ]);

    expect(result).toEqual({
      offer: {
        price: { intro: "$349/year", list: "$499/year" },
        purchaseUrl: "https://orionfold.com/relay/",
        premiumPackCount: 2,
      },
      error: null,
    });
  });

  it("fails closed when price or purchase destination drifts", () => {
    const priceDrift = resolvePremiumCatalogOffer([
      premium("one"),
      premium("two", { price: { list: "$599/year" } }),
    ]);
    const urlDrift = resolvePremiumCatalogOffer([
      premium("one"),
      premium("two", { purchaseUrl: "https://example.com/other" }),
    ]);

    expect(priceDrift).toEqual({
      offer: null,
      error: 'Premium Pack "two" does not match the shared product price.',
    });
    expect(urlDrift).toEqual({
      offer: null,
      error:
        'Premium Pack "two" does not match the shared purchase destination.',
    });
  });

  it("fails closed when the first premium Pack lacks offer metadata", () => {
    const result = resolvePremiumCatalogOffer([
      premium("one", { price: undefined }),
    ]);

    expect(result.offer).toBeNull();
    expect(result.error).toContain("missing the shared product price");
  });

  it("turns verbose Pack copy into compact decision fields", () => {
    const summary = summarizePackDecision(
      premium("one", {
        related: { text: "Builds alongside Relay Agency." },
      }),
    );

    expect(summary).toEqual({
      job: "Run the core job.",
      chooseWhen:
        "Choose this when the operating work needs a repeatable path.",
      includes: "2 profiles · 1 workflow",
      worksWith: "Builds alongside Relay Agency.",
    });
  });

  it("describes bundle contents when its placeholder manifest has no primitive summary", () => {
    const template = premium("bundle", {
      bundle: ["child-one", "child-two"],
    });
    template.primitivesSummary = "";
    const summary = summarizePackDecision(template);

    expect(summary.includes).toBe("2 Packs composed into one installed app");
  });
});
