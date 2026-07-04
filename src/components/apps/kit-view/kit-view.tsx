import type { ViewModel } from "@/lib/apps/view-kits/types";
import { HeaderSlotView } from "./slots/header";
import { KpisSlotView } from "./slots/kpis";
import { HeroSlotView } from "./slots/hero";
import { SecondarySlotView } from "./slots/secondary";
import { ActivitySlotView } from "./slots/activity";
import { FooterSlotView } from "./slots/footer";

interface KitViewProps {
  model: ViewModel;
}

/**
 * Server component that maps a kit's `ViewModel` to slot components in the
 * canonical order: Header → KPIs → Hero → Secondary → Activity → Footer.
 *
 * Empty/undefined slots render nothing (the slot views guard themselves).
 * The footer's `manifestPane` data is forwarded into the header so the
 * header's trigger button can open the sheet — single source of truth.
 */
export function KitView({ model }: KitViewProps) {
  return (
    <div className="space-y-6">
      <HeaderSlotView slot={model.header} manifestPane={model.footer} />
      {model.kpis && <KpisSlotView tiles={model.kpis} />}
      {model.hero && <HeroSlotView slot={model.hero} />}
      {model.secondary && model.secondary.length > 0 && (
        <div className="space-y-3">
          {model.secondaryLead && (
            <p className="text-sm text-muted-foreground">
              {model.secondaryLead}
            </p>
          )}
          {model.secondarySteps && model.secondarySteps.length > 0 && (
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {model.secondarySteps.map((step, i) => (
                <li key={step.n} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {step.n}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {step.text}
                  </span>
                  {i < model.secondarySteps!.length - 1 && (
                    <span aria-hidden className="text-muted-foreground/40">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <SecondarySlotView slots={model.secondary} />
        </div>
      )}
      {model.activity && <ActivitySlotView slot={model.activity} />}
      {model.footer && <FooterSlotView slot={model.footer} />}
    </div>
  );
}
