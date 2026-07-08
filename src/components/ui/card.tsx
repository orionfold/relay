import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// ── Card variants ────────────────────────────────────────────────────
// The base primitive gains three optional, backward-compatible layers so
// every card surface can adopt the orionfold.com "THE PROOF" North Star look
// (F5) without hand-rolling ad-hoc classes. Passing NO variant reproduces the
// original shadcn Card byte-for-byte (tone: "neutral", emphasis: "none"), so
// existing call sites are untouched until they opt in.
//
//   tone      — per-primitive-kind bg/border tint. The tone IS the type cue
//               (F1): a blueprint card reads teal, an agent card violet, etc.
//   emphasis  — "featured" is the accent/payoff variant ("Start here"): a
//               primary-tinted surface + ring. Replaces the ad-hoc
//               `border-primary ring-1` pattern that lived in last-run-card.
//   watermark — a large faint glyph behind the content (via the `watermark`
//               prop below), adding per-card identity + depth. Requires
//               overflow-hidden, which the variant turns on.

const cardVariants = cva(
  "relative flex flex-col gap-6 rounded-xl border py-6 text-card-foreground shadow-sm",
  {
    variants: {
      tone: {
        neutral: "bg-card",
        // Faint hue washes — the primitive-type cue. These route through
        // CSS tokens so light/dark themes can tune each card family without
        // hardcoding Tailwind color scales into the primitive.
        blueprint: "flagship-card-tone flagship-card-tone-blueprint",
        app: "flagship-card-tone flagship-card-tone-app",
        agent: "flagship-card-tone flagship-card-tone-agent",
        preset: "flagship-card-tone flagship-card-tone-preset",
        schedule: "flagship-card-tone flagship-card-tone-schedule",
        schema: "flagship-card-tone flagship-card-tone-schema",
        pack: "flagship-card-tone flagship-card-tone-pack",
        template: "flagship-card-tone flagship-card-tone-template",
        metric: "bg-card",
      },
      emphasis: {
        none: "",
        // The North Star payoff card — token-swap over whatever tone, so a
        // featured blueprint still reads teal but pops via the primary ring.
        featured: "flagship-card-featured ring-1 ring-primary/20",
      },
    },
    defaultVariants: {
      tone: "neutral",
      emphasis: "none",
    },
  }
)

interface CardProps
  extends React.ComponentProps<"div">,
    VariantProps<typeof cardVariants> {
  /**
   * Large faint glyph rendered behind the card content for per-card identity
   * (F5 North Star). Sits at low opacity in the top-right, clipped by the
   * container's overflow-hidden. Purely decorative — marked aria-hidden.
   */
  watermark?: LucideIcon
  /**
   * Per-type color for the watermark glyph (a CSS color string, typically the
   * oklch `icon` color from the card-icons CircleColors so the watermark reads
   * the same type-color the left IconCircle used to). When omitted, the glyph
   * falls back to a neutral foreground tint. The color is applied at low
   * opacity so it stays a background wash, not a foreground mark.
   */
  watermarkColor?: string
  /**
   * Applies the shared flagship hover/click motion contract. Keep explicit so
   * static informational cards do not move just because they have a tone.
   */
  interactive?: boolean
}

function Card({
  className,
  tone,
  emphasis,
  watermark: Watermark,
  watermarkColor,
  interactive = false,
  children,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        cardVariants({ tone, emphasis }),
        Watermark && "overflow-hidden",
        interactive && "flagship-card-interactive",
        className
      )}
      {...props}
    >
      {Watermark && (
        <Watermark
          aria-hidden
          // +20% over the prior h-32 (→ 9.6rem) and shifted inward from the
          // corner so the glyph reads as a crafted part of every card rather
          // than hanging off the edge. Uniform on ALL cards — the watermark is
          // a consistent polish layer, not the featured cue.
          //
          // When a watermarkColor is given, the glyph carries that type-color
          // (at low opacity, so it's a wash not a mark) — the same per-type
          // color the left IconCircle used to. Otherwise it falls back to a
          // neutral foreground tint.
          className={cn(
            "pointer-events-none absolute -right-3 -top-3 h-[9.6rem] w-[9.6rem] select-none",
            !watermarkColor && "text-foreground/[0.07]"
          )}
          style={
            watermarkColor
              ? { color: watermarkColor, opacity: 0.12 }
              : undefined
          }
        />
      )}
      {children}
    </div>
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-6", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  cardVariants,
}

export type { CardProps }
