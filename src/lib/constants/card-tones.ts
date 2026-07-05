/**
 * Per-primitive-kind card tone + watermark glyph map (F5 North Star lift).
 *
 * A card's `tone` is its primitive-type cue (F1): a blueprint reads teal, an
 * agent blue, a schedule amber, etc. The `glyph` is the large faint watermark
 * rendered behind the card content for per-card identity. One source of truth
 * so every surface that renders a primitive card reads the same type the same
 * way — the tone/glyph pair IS the "what kind of thing is this" signal the
 * app-shell cards were missing.
 *
 * Kinds mirror the four primitive kinds `packOf()` resolves plus the display-
 * only surfaces (metric tiles, templates) that also want the treatment.
 */
import {
  Layers,
  Package,
  Bot,
  Sparkles,
  Clock,
  LayoutTemplate,
  Boxes,
  Table2,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

import type { CardProps } from "@/components/ui/card";

/** The union of `tone` values the base Card exposes. */
export type CardTone = NonNullable<CardProps["tone"]>;

export interface KindStyle {
  tone: CardTone;
  glyph: LucideIcon;
}

/**
 * Card kind → { tone, watermark glyph }. Keep in sync with the `tone` variant
 * union in `card.tsx`; a kind here must name a tone that exists there.
 */
export const CARD_KIND_STYLES = {
  blueprint: { tone: "blueprint", glyph: Layers },
  app: { tone: "app", glyph: Package },
  agent: { tone: "agent", glyph: Bot },
  preset: { tone: "preset", glyph: Sparkles },
  schedule: { tone: "schedule", glyph: Clock },
  schema: { tone: "schema", glyph: LayoutTemplate },
  pack: { tone: "pack", glyph: Boxes },
  template: { tone: "template", glyph: Table2 },
  metric: { tone: "metric", glyph: BarChart3 },
} as const satisfies Record<string, KindStyle>;

export type CardKind = keyof typeof CARD_KIND_STYLES;

/** Look up the tone + glyph for a primitive kind. */
export function cardKindStyle(kind: CardKind): KindStyle {
  return CARD_KIND_STYLES[kind];
}
