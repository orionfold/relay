import type { SecondarySlot } from "@/lib/apps/view-kits/types";

interface SecondarySlotProps {
  slots: SecondarySlot[];
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
export function SecondarySlotView({ slots }: SecondarySlotProps) {
  if (slots.length === 0) return null;
  const groups = groupSlots(slots);

  return (
    <div className="space-y-4">
      {groups.map((group, i) =>
        group.kind === "full" ? (
          <SecondarySection key={group.slot.id} slot={group.slot} />
        ) : (
          <SecondaryMasonry key={`masonry-${i}`} slots={group.slots} />
        )
      )}
    </div>
  );
}

type SecondarySlotGroup =
  | { kind: "full"; slot: SecondarySlot }
  | { kind: "masonry"; slots: SecondarySlot[] };

function groupSlots(slots: SecondarySlot[]): SecondarySlotGroup[] {
  const groups: SecondarySlotGroup[] = [];
  let masonry: SecondarySlot[] = [];

  for (const slot of slots) {
    if (slot.fullWidth) {
      if (masonry.length > 0) {
        groups.push({ kind: "masonry", slots: masonry });
        masonry = [];
      }
      groups.push({ kind: "full", slot });
    } else {
      masonry.push(slot);
    }
  }

  if (masonry.length > 0) {
    groups.push({ kind: "masonry", slots: masonry });
  }

  return groups;
}

function SecondaryMasonry({ slots }: SecondarySlotProps) {
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
