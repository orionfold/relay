import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Sparkles, Wallet, ArrowRight } from "lucide-react";
import { AinativeWordmark } from "@/components/shared/ainative-wordmark";
import { StarterTemplateCard } from "@/components/apps/starter-template-card";
import { PackInstallButton } from "@/components/packs/pack-install-button";
import type { StarterTemplate } from "@/lib/apps/starters";
import type {
  CustomerOrientation,
  OrientationAction,
} from "@/lib/onboarding/orientation";

const pillars = [
  {
    icon: Sparkles,
    title: "Packs from a sentence",
    description: "Tell Relay what you do each week. It builds an installed pack for you. No code needed.",
  },
  {
    icon: Shield,
    title: "Your rules, enforced",
    description: "Agents follow your rules on every task. You get a full record of what they did.",
  },
  {
    icon: Wallet,
    title: "Know what you spend",
    description: "See the cost of each task. Set a budget so you never get a surprise bill.",
  },
];

interface WelcomeLandingProps {
  orientation: CustomerOrientation;
  starters?: StarterTemplate[];
}

/**
 * WelcomeLanding — shown on fresh instances with no tasks.
 * Entitlement-aware hero + ranked action cluster + product pillars + starter
 * cards. The first action comes from the shared orientation contract, so a
 * Community customer can explicitly install Agency while Pack and Host
 * customers continue the capability they already unlocked.
 */
export function WelcomeLanding({
  orientation,
  starters = [],
}: WelcomeLandingProps) {
  const visibleStarters = starters.slice(0, 3);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-3xl mx-auto text-center px-4 py-8">
      <AinativeWordmark className="mb-4" />
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
        <Badge variant={orientation.edition === "licensed" ? "success" : "secondary"}>
          {orientation.entitlementLabel}
        </Badge>
        {orientation.license.licensee && (
          <Badge variant="outline">
            Licensed to {orientation.license.licensee}
          </Badge>
        )}
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-3">
        {orientation.headline}
      </h1>
      <p className="text-base text-muted-foreground mb-8 max-w-lg">
        {orientation.description}
      </p>
      {orientation.packs.readError && (
        <p
          role="alert"
          className="mb-4 max-w-lg rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-2 text-sm text-status-warning"
        >
          Relay could not check Pack availability: {orientation.packs.readError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <WelcomeAction action={orientation.primaryAction} primary />
        {orientation.secondaryActions.map((action) => (
          <WelcomeAction
            key={
              action.kind === "link"
                ? `${action.kind}:${action.href}`
                : `${action.kind}:${action.packId}`
            }
            action={action}
          />
        ))}
      </div>

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
              Or start from a ready-made pack
            </h2>
            <Link
              href="/packs"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse packs
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

function WelcomeAction({
  action,
  primary = false,
}: {
  action: OrientationAction;
  primary?: boolean;
}) {
  if (action.kind === "install_pack") {
    return (
      <PackInstallButton
        packId={action.packId}
        packName={action.packName}
        premium={false}
        size="lg"
        variant={primary ? "default" : "outline"}
        installLabel={action.label}
        successHref={`/apps/${action.packId}`}
      />
    );
  }

  return (
    <Button asChild size="lg" variant={primary ? "default" : "outline"}>
      <Link href={action.href}>
        {action.label}
        {primary && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
      </Link>
    </Button>
  );
}
