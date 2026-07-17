import Link from "next/link";
import { Building2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function ProjectContextBadges({
  customerId,
  customerName,
  status,
}: {
  customerId: string | null;
  customerName: string | null;
  status: string;
}) {
  const statusVariant: Record<string, "default" | "secondary" | "outline"> = {
    active: "default",
    paused: "secondary",
    completed: "outline",
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {customerId ? (
        <Link
          href={`/customers/${customerId}`}
          aria-label={`Open customer ${customerName ?? customerId}`}
        >
          <Badge variant="outline" className="gap-1.5 hover:bg-accent">
            <Building2 className="h-3 w-3" />
            {customerName ?? "Unknown customer"}
          </Badge>
        </Link>
      ) : (
        <Badge variant="secondary" className="gap-1.5 font-normal">
          <Building2 className="h-3 w-3" />
          No customer
        </Badge>
      )}
      <Badge variant={statusVariant[status] ?? "secondary"}>{status}</Badge>
    </div>
  );
}
