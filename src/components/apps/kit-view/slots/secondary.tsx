import type { SecondarySlot } from "@/lib/apps/view-kits/types";

interface SecondarySlotProps {
  slots: SecondarySlot[];
  workflowLead?: string;
  workflowSteps?: { n: number; text: string }[];
}

/**
 * Renders secondary cards in a masonry (multi-column) layout so cards of
 * uneven height pack to their natural size instead of stretching to the
 * tallest card in a row (F2). Used by the Workflow Hub (one runnable blueprint
 * card per app workflow — often 6+ cards of differing content length) and by
 * domain kits (Coach "Open questions"/"Risk", Ledger "Top movers"/…).
 *
 * CSS multi-column gives true masonry with zero JS: each card flows to its
 * natural height and column-packs. `break-inside-avoid` keeps a card whole;
 * `mb-4` supplies the vertical gap (multicol has no row-gap). Click targets,
 * tab order, and embedded Run buttons are untouched — this is pure layout.
 * A single card degrades to one full-width column, identical to before.
 */
export function SecondarySlotView({
  slots,
  workflowLead,
  workflowSteps,
}: SecondarySlotProps) {
  if (slots.length === 0) return null;
  const groups = groupSlots(slots);

  return (
    <div className="space-y-4">
      {groups.map((group, i) =>
        group.kind === "full" ? (
          <SecondarySection key={group.slot.id} slot={group.slot} />
        ) : (
          <SecondaryAutoSection
            key={`${group.primitiveKind}-${i}`}
            primitiveKind={group.primitiveKind}
            slots={group.slots}
            workflowLead={workflowLead}
            workflowSteps={workflowSteps}
          />
        )
      )}
    </div>
  );
}

type SecondarySlotGroup =
  | { kind: "full"; slot: SecondarySlot }
  | {
      kind: "auto";
      primitiveKind: NonNullable<SecondarySlot["primitiveKind"]>;
      slots: SecondarySlot[];
    };

function groupSlots(slots: SecondarySlot[]): SecondarySlotGroup[] {
  const groups: SecondarySlotGroup[] = [];
  let current: SecondarySlot[] = [];
  let currentKind: NonNullable<SecondarySlot["primitiveKind"]> | null = null;

  function flushCurrent() {
    if (current.length > 0 && currentKind) {
      groups.push({ kind: "auto", primitiveKind: currentKind, slots: current });
      current = [];
      currentKind = null;
    }
  }

  for (const slot of slots) {
    if (slot.fullWidth) {
      flushCurrent();
      groups.push({ kind: "full", slot });
    } else {
      const kind = slot.primitiveKind ?? "generic";
      if (currentKind && kind !== currentKind) flushCurrent();
      currentKind = kind;
      current.push(slot);
    }
  }

  flushCurrent();

  return groups;
}

function SecondaryAutoSection({
  primitiveKind,
  slots,
  workflowLead,
  workflowSteps,
}: Required<Pick<SecondarySlotProps, "slots">> & {
  primitiveKind: NonNullable<SecondarySlot["primitiveKind"]>;
  workflowLead?: string;
  workflowSteps?: { n: number; text: string }[];
}) {
  const config = sectionConfig(primitiveKind);
  const headingId = config.title ? `secondary-section-${primitiveKind}` : undefined;
  const showWorkflowIntro =
    primitiveKind === "workflow" && Boolean(workflowLead || workflowSteps?.length);

  return (
    <section
      data-kit-slot-section={primitiveKind}
      aria-labelledby={headingId}
      className="space-y-3"
    >
      {config.title && (
        <div className="space-y-1">
          <h2 id={headingId} className="text-sm font-medium">
            {config.title}
          </h2>
          {config.description && (
            <p className="text-xs text-muted-foreground">
              {config.description}
            </p>
          )}
        </div>
      )}
      {showWorkflowIntro && (
        <div className="surface-card-muted rounded-lg border p-3">
          {workflowLead && (
            <p className="text-sm text-muted-foreground">
              {workflowLead}
            </p>
          )}
          {workflowSteps && workflowSteps.length > 0 && (
            <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {workflowSteps.map((step, i) => (
                <li key={step.n} className="flex items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {step.n}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {step.text}
                  </span>
                  {i < workflowSteps.length - 1 && (
                    <span aria-hidden className="text-muted-foreground/40">
                      →
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {config.layout === "grid" ? (
        <SecondaryGrid slots={slots} primitiveKind={primitiveKind} />
      ) : (
        <SecondaryMasonry slots={slots} />
      )}
    </section>
  );
}

function SecondaryGrid({
  slots,
  primitiveKind,
}: {
  slots: SecondarySlot[];
  primitiveKind: NonNullable<SecondarySlot["primitiveKind"]>;
}) {
  const cols =
    primitiveKind === "chart"
      ? slots.length === 1
        ? "grid-cols-1"
        : "grid-cols-1 lg:grid-cols-2"
      : slots.length === 1
        ? "grid-cols-1"
        : slots.length === 2
          ? "grid-cols-1 sm:grid-cols-2"
          : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";

  return (
    <div className={`grid gap-4 ${cols}`}>
      {slots.map((slot) => (
        <SecondarySection key={slot.id} slot={slot} />
      ))}
    </div>
  );
}

function SecondaryMasonry({ slots }: Pick<SecondarySlotProps, "slots">) {
  const cols =
    slots.length === 1
      ? "columns-1"
      : slots.length === 2
        ? "columns-1 sm:columns-2"
        : "columns-1 sm:columns-2 lg:columns-3";
  return (
    <div className={`gap-4 ${cols}`}>
      {slots.map((slot) => (
        <SecondarySection key={slot.id} slot={slot} masonry />
      ))}
    </div>
  );
}

function sectionConfig(kind: NonNullable<SecondarySlot["primitiveKind"]>) {
  switch (kind) {
    case "workflow":
      return {
        title: "Workflows",
        description: "Runnable pack actions and automation entry points.",
        layout: "grid" as const,
      };
    case "chart":
      return {
        title: "Charts",
        description: "Declared visual readouts from this pack's tables.",
        layout: "grid" as const,
      };
    case "table":
      return {
        title: "Tables",
        description: "Data-backed primitives promoted by this pack.",
        layout: "grid" as const,
      };
    case "generic":
      return {
        title: undefined,
        description: undefined,
        layout: "masonry" as const,
      };
    case "funnel":
    case "gallery":
      return {
        title: undefined,
        description: undefined,
        layout: "grid" as const,
      };
  }
}

function SecondarySection({
  slot,
  masonry = false,
}: {
  slot: SecondarySlot;
  masonry?: boolean;
}) {
  return (
    <section
      data-kit-slot="secondary"
      data-kit-slot-width={slot.fullWidth ? "full" : "auto"}
      className={`space-y-2 ${masonry ? "mb-4 break-inside-avoid" : ""}`}
    >
      {slot.title && (
        <h2 className="text-sm font-medium">{slot.title}</h2>
      )}
      {slot.content}
    </section>
  );
}
