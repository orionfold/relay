import type { PackTemplate } from "./catalog";
import { packPrice, type PackPrice } from "./format";

export interface PremiumCatalogOffer {
  price: PackPrice;
  purchaseUrl: string;
  premiumPackCount: number;
}

export type PremiumCatalogOfferResult =
  | { offer: PremiumCatalogOffer; error: null }
  | { offer: null; error: string | null };

function samePrice(left: PackPrice, right: PackPrice): boolean {
  return left.intro === right.intro && left.list === right.list;
}

/**
 * Resolve the one product offer shown above the premium Pack catalog.
 * Pack-level metadata remains the offline release snapshot, but every premium
 * Pack must agree before Relay renders a single price or purchase destination.
 */
export function resolvePremiumCatalogOffer(
  templates: PackTemplate[],
): PremiumCatalogOfferResult {
  const premium = templates.filter(
    (template) => !template.error && Boolean(template.meta?.entitlement),
  );
  if (premium.length === 0) return { offer: null, error: null };

  const first = premium[0];
  const firstPrice = packPrice(first.meta!);
  const firstUrl = first.meta?.purchaseUrl;
  if (!firstPrice || !firstUrl) {
    return {
      offer: null,
      error: `Premium Pack "${first.id}" is missing the shared product price or purchase destination.`,
    };
  }

  for (const template of premium.slice(1)) {
    const price = packPrice(template.meta!);
    if (!price || !samePrice(firstPrice, price)) {
      return {
        offer: null,
        error: `Premium Pack "${template.id}" does not match the shared product price.`,
      };
    }
    if (template.meta?.purchaseUrl !== firstUrl) {
      return {
        offer: null,
        error: `Premium Pack "${template.id}" does not match the shared purchase destination.`,
      };
    }
  }

  return {
    offer: {
      price: firstPrice,
      purchaseUrl: firstUrl,
      premiumPackCount: premium.length,
    },
    error: null,
  };
}

export interface PackDecisionSummary {
  job: string;
  chooseWhen: string;
  includes: string;
  worksWith: string | null;
}

function sentences(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        sentence.length > 0 &&
        !sentence.startsWith("Everything installs") &&
        !sentence.startsWith("Relay never sends"),
    );
}

export function summarizePackDecision(
  template: PackTemplate,
): PackDecisionSummary {
  const meta = template.meta!;
  const parts = sentences(meta.description);
  const isBundle = Boolean(meta.bundle?.length);
  return {
    job: parts[0] ?? meta.name,
    chooseWhen:
      parts[1] ??
      (isBundle
        ? "Choose it when you want one composed app instead of installing its parts separately."
        : `Choose it when ${meta.name} matches the operating work you want Relay to run.`),
    includes:
      template.primitivesSummary?.trim() ||
      (isBundle
        ? `${meta.bundle!.length} Packs composed into one installed app`
        : "A complete installable Relay Pack"),
    worksWith: meta.related?.text ?? null,
  };
}
