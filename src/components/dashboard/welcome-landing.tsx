import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Shield, Sparkles, Wallet, ArrowRight } from "lucide-react";
import { AinativeWordmark } from "@/components/shared/ainative-wordmark";
import { StarterTemplateCard } from "@/components/apps/starter-template-card";
import type { StarterTemplate } from "@/lib/apps/starters";

const pillars = [
  {
    icon: Sparkles,
    title: "Apps from a sentence",
    description: "Describe what you do every week. Orionfold Relay composes the profile, blueprint, schedule, and tables into a running app. No code.",
  },
  {
    icon: Shield,
    title: "Your rules, enforced",
    description: "Every agent action respects your policies. Full audit trail for every decision.",
  },
  {
    icon: Wallet,
    title: "Know what you spend",
    description: "Track spend per task, per provider. Budget guardrails prevent surprise bills.",
  },
];

interface WelcomeLandingProps {
  starters?: StarterTemplate[];
}

/**
 * WelcomeLanding — shown on fresh instances with no tasks.
 * Hero + 3 pillars (apps-first) + 2-CTA cluster + starter cards row. The
 * starter row is the discovery surface for Relay's marquee feature; the
 * "Build your first app" CTA routes to /chat where the chat-empty-state
 * surfaces the same starters and example prompts.
 */
export function WelcomeLanding({ starters = [] }: WelcomeLandingProps) {
  const visibleStarters = starters.slice(0, 3);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-3xl mx-auto text-center px-4 py-8">
      <AinativeWordmark className="mb-4" />
      <h1 className="text-3xl font-bold tracking-tight mb-3">
        Welcome
      </h1>
      <p className="text-base text-muted-foreground mb-8 max-w-lg">
        Your AI Business Operating System. Describe an app, Orionfold Relay builds it, and runs it on your rules, your budget, your data.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mb-8">
        {pillars.map((pillar) => (
          <div
            key={pillar.title}
            className="surface-card-muted rounded-lg p-4 text-left"
          >
            <pillar.icon className="h-5 w-5 text-primary mb-2" />
            <h3 className="text-sm font-semibold mb-1">{pillar.title}</h3>
            <p className="text-xs text-muted-foreground">
              {pillar.description}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
        <Link href="/chat">
          <Button size="lg" className="gap-1.5">
            Build your first app
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/tasks">
          <Button size="lg" variant="outline">
            Or browse the workspace
          </Button>
        </Link>
      </div>

      {visibleStarters.length > 0 && (
        <section
          aria-labelledby="welcome-starters-heading"
          className="w-full space-y-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2
              id="welcome-starters-heading"
              className="text-xs font-medium text-muted-foreground"
            >
              Or start from a ready-made app
            </h2>
            <Link
              href="/apps"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse all
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-left">
            {visibleStarters.map((s) => (
              <StarterTemplateCard key={s.id} starter={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
