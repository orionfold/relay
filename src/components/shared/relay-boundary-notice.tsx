import Link from "next/link";
import { FolderLock, Info } from "lucide-react";

export function CustomerBoundaryNotice() {
  return (
    <section
      className="surface-control rounded-xl px-4 py-3"
      aria-labelledby="customer-boundary-heading"
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <h2 id="customer-boundary-heading" className="text-sm font-medium">
              Attribution, not isolation
            </h2>
            <Link
              href="/settings#settings-instance"
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Review Relay cell boundary →
            </Link>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            This customer groups projects and cost inside the current Relay cell.
            It does not create a separate database, file store, credential store,
            agent boundary, or runtime policy.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ProjectBoundaryNotice({
  workingDirectory,
  source,
}: {
  workingDirectory: string;
  source: "project" | "launch";
}) {
  return (
    <section
      className="surface-control rounded-xl px-4 py-3"
      aria-labelledby="project-boundary-heading"
    >
      <div className="flex items-start gap-3">
        <FolderLock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h2 id="project-boundary-heading" className="text-sm font-medium">
            Execution context, not isolation
          </h2>
          <p
            className="mt-1 break-all font-mono text-[11px] text-foreground"
            title={workingDirectory}
          >
            {workingDirectory}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {source === "project"
              ? "Tasks in this project use this working directory when the selected runtime supports it. "
              : "This project uses the Relay launch workspace as its task working-directory fallback. "}
            The execution context does not isolate Relay data, credentials,
            agents, or runtimes from other records in the cell.
          </p>
        </div>
      </div>
    </section>
  );
}
