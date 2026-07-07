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
        <SecondarySlotView
          slots={model.secondary}
          workflowLead={model.secondaryLead}
          workflowSteps={model.secondarySteps}
        />
      )}
      {model.activity && <ActivitySlotView slot={model.activity} />}
      {model.footer && <FooterSlotView slot={model.footer} />}
    </div>
  );
}
