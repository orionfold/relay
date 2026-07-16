import Link from "next/link";
import { FileText } from "lucide-react";

export interface RecentOutput {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

export function RecentOutputsModule({ outputs }: { outputs: RecentOutput[] }) {
  if (outputs.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No retained outputs yet.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      {outputs.slice(0, 5).map((output) => (
        <Link
          key={output.id}
          href={`/documents/${output.id}`}
          data-interactive-surface=""
          data-interactive-outline="preserve"
          className="interactive-list-item flex min-w-0 items-center gap-3 rounded-md px-2 py-2"
        >
          <FileText className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{output.name}</p>
            <p className="text-xs text-muted-foreground">
              {output.status} · {new Date(output.createdAt).toLocaleDateString()}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
