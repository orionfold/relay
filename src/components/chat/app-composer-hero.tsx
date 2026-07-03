"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StarterTemplateCard } from "@/components/apps/starter-template-card";
import type { StarterTemplate } from "@/lib/apps/starters";

interface AppComposerHeroProps {
  starters: StarterTemplate[];
  /** Click handler for the example-prompt chips. Seeds the chat input via
   *  the same channel ChatEmptyState already uses for category prompts. */
  onSeedPrompt: (prompt: string) => void;
}

const EXAMPLE_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: "Build me a reading log…",
    prompt:
      "Build me a reading log. Track each book with title, author, date finished, and a rating from 1 to 5. Every Friday at 5pm, summarize what I read this week.",
  },
  {
    label: "Build me an expense tracker for my contractors…",
    prompt:
      "Build me an expense tracker for my contractors. Track each invoice with contractor name, amount, category, due date, and paid status. On the 1st of every month, summarize totals by contractor and flag anything overdue.",
  },
];

/**
 * AppComposerHero — surfaces ainative's app-composition capability on first
 * paint of the chat hero. Three starter cards (read from
 * `.claude/apps/starters/`), two example prompts, and a "Browse all" link to
 * `/apps`. Designed for new users who otherwise wouldn't know the system can
 * compose entire apps from a single sentence.
 */
export function AppComposerHero({ starters, onSeedPrompt }: AppComposerHeroProps) {
  if (starters.length === 0) return null;
  const visibleStarters = starters.slice(0, 3);

  return (
    <section
      aria-labelledby="app-composer-hero-heading"
      className="w-full max-w-3xl space-y-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          id="app-composer-hero-heading"
          className="text-xs font-medium text-muted-foreground"
        >
          Or start from a ready-made app
        </h3>
        <Link
          href="/apps"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Browse all
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {visibleStarters.map((s) => (
          <StarterTemplateCard
            key={s.id}
            starter={s}
            onClick={(picked) => onSeedPrompt(picked.starterPrompt)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <span className="text-xs text-muted-foreground">Or try:</span>
        {EXAMPLE_PROMPTS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onSeedPrompt(p.prompt)}
            className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </section>
  );
}
