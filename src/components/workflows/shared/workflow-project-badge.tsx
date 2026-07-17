import Link from "next/link";
import { FolderKanban } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function WorkflowProjectBadge({
  projectId,
  projectName,
}: {
  projectId: string | null | undefined;
  projectName: string | null | undefined;
}) {
  if (!projectId) return null;

  return (
    <Link href={`/projects/${projectId}`} aria-label={`Open project ${projectName ?? projectId}`}>
      <Badge variant="outline" className="gap-1 text-xs hover:bg-accent">
        <FolderKanban className="h-3 w-3" />
        {projectName ?? "Unknown project"}
      </Badge>
    </Link>
  );
}
