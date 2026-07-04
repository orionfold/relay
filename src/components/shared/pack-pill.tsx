import { Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface PackPillProps {
  /** The installed pack's display name (e.g. "Relay Agency"), from its manifest. */
  packName: string;
  className?: string;
}

/**
 * PackPill — provenance label marking a primitive (profile, blueprint, table,
 * schedule) as installed by a pack (FEAT-8, spec:
 * features/fix-app-shell-activation-redesign.md).
 *
 * Deliberately NOT a StatusChip / status-family: pack provenance is an open-set
 * identity ("which pack"), not one of the 5 fixed status dimensions. It shares
 * the visual system by building on the same `Badge` primitive StatusChip uses,
 * with its own icon (package) and a distinct amber color family so it reads as
 * a provenance marker — the sibling of the card's existing Imported/Discovered/
 * Built-in badges, and outranks the "Custom" fallback (a pack-installed
 * primitive is never "Custom").
 */
export function PackPill({ packName, className }: PackPillProps) {
  return (
    <Badge
      data-testid="pack-pill"
      variant="outline"
      title={`Installed by the ${packName} pack`}
      className={cn(
        "border-amber-200 text-amber-700 dark:border-amber-800 dark:text-amber-400",
        className
      )}
    >
      <Package className="mr-1 h-3 w-3" />
      {packName}
    </Badge>
  );
}
