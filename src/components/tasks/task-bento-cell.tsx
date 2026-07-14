import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface TaskBentoCellProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  subLabel?: string;
  href?: string;
  iconClassName?: string;
}

export function TaskBentoCell({
  icon: Icon,
  label,
  value,
  subLabel,
  href,
  iconClassName,
}: TaskBentoCellProps) {
  const content = (
    <>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-4 w-4 text-muted-foreground ${iconClassName ?? ""}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums leading-tight mt-1">{value}</div>
      {subLabel && (
        <span className="text-xs text-muted-foreground mt-0.5">{subLabel}</span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="surface-card-muted rounded-lg p-3 hover:bg-accent/50 transition-colors block"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="surface-card-muted rounded-lg p-3">
      {content}
    </div>
  );
}
