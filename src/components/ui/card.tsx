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
        // Faint hue washes — the primitive-type cue. Each is a ~4% tint +
        // ~20% border so cards read as different *types* at a glance without
        // competing with content. Dark-mode tints are handled by the /NN
        // alpha compositing over the themed --card behind them.
        blueprint: "bg-primary/[0.04] border-primary/20",
        app: "bg-violet-500/[0.04] border-violet-500/20 dark:bg-violet-400/[0.05]",
        agent: "bg-blue-500/[0.04] border-blue-500/20 dark:bg-blue-400/[0.05]",
        preset: "bg-fuchsia-500/[0.04] border-fuchsia-500/20 dark:bg-fuchsia-400/[0.05]",
        schedule: "bg-amber-500/[0.04] border-amber-500/20 dark:bg-amber-400/[0.05]",
        schema: "bg-teal-500/[0.04] border-teal-500/20 dark:bg-teal-400/[0.05]",
        pack: "bg-indigo-500/[0.04] border-indigo-500/20 dark:bg-indigo-400/[0.05]",
        template: "bg-emerald-500/[0.04] border-emerald-500/20 dark:bg-emerald-400/[0.05]",
        metric: "bg-card",
      },
      emphasis: {
        none: "",
        // The North Star payoff card — token-swap over whatever tone, so a
        // featured blueprint still reads teal but pops via the primary ring.
        featured: "border-primary/40 bg-primary/[0.06] ring-1 ring-primary/20",
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
}

function Card({
  className,
  tone,
  emphasis,
  watermark: Watermark,
  children,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        cardVariants({ tone, emphasis }),
        Watermark && "overflow-hidden",
        className
      )}
      {...props}
    >
      {Watermark && (
        <Watermark
          aria-hidden
          className={cn(
            // +20% over the prior h-32 (→ 9.6rem) and shifted inward from the
            // corner by the same step, so the glyph reads as a crafted part of
            // every card rather than hanging off the edge. Uniform opacity on
            // ALL cards — the watermark is a consistent polish layer, not the
            // featured cue (the accent tint + "Start here" badge + taller
            // content already distinguish the featured card).
            "pointer-events-none absolute -right-3 -top-3 h-[9.6rem] w-[9.6rem] select-none text-foreground/[0.07]"
          )}
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
