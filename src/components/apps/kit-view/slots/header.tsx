import { StatusChip } from "@/components/shared/status-chip";
import { ManifestSheet } from "./manifest-sheet";
import { ScheduleCadenceChip } from "@/components/apps/schedule-cadence-chip";
import { RunNowButton } from "@/components/apps/run-now-button";
import { PeriodSelectorChip } from "@/components/apps/period-selector-chip";
import { TriggerSourceChip } from "@/components/apps/trigger-source-chip";
import type { HeaderSlot, ManifestPaneSlot } from "@/lib/apps/view-kits/types";

interface HeaderSlotProps {
  slot: HeaderSlot;
  /**
   * When provided, the header surfaces a "View manifest ▾" trigger that
   * opens the manifest sheet. Sourced from `model.footer` by `<KitView/>`.
   */
  manifestPane?: ManifestPaneSlot;
}

/**
 * Renders the header row for a kit. Title + description on the left, status
 * chip + caller-supplied actions + "View manifest ▾" trigger on the right.
 */
export function HeaderSlotView({ slot, manifestPane }: HeaderSlotProps) {
  const { title, description, status, actions, cadenceChip, runNowBlueprintId, runNowVariables, periodChip, triggerSourceChip } = slot;
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight line-clamp-2" title={title}>
          {title}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 truncate" title={description}>
            {description}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0 sm:flex-nowrap sm:shrink-0">
        {status && <StatusChip status={status} size="md" />}
        {cadenceChip && (
          <ScheduleCadenceChip
            humanLabel={cadenceChip.humanLabel}
            nextFireMs={cadenceChip.nextFireMs}
          />
        )}
        {periodChip && <PeriodSelectorChip current={periodChip.current} />}
        {triggerSourceChip && <TriggerSourceChip trigger={triggerSourceChip} />}
        {triggerSourceChip?.kind !== "row-insert" && runNowBlueprintId && (
          <RunNowButton blueprintId={runNowBlueprintId} variables={runNowVariables} />
        )}
        {actions}
        {manifestPane && (
          <ManifestSheet
            appName={manifestPane.appName}
            body={manifestPane.body}
          />
        )}
      </div>
    </div>
  );
}
