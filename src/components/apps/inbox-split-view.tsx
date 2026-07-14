"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { LightMarkdown } from "@/components/shared/light-markdown";

interface QueueRow {
  id: string;
  title: string;
  subtitle?: string;
}

interface DraftDocument {
  id: string;
  filename: string;
  content: string;
  taskId: string;
}

interface InboxSplitViewProps {
  queue: QueueRow[];
  selectedRowId: string | null;
  draft: DraftDocument | null;
}

export function InboxSplitView({
  queue,
  selectedRowId,
  draft,
}: InboxSplitViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function selectRow(rowId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("row", rowId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(280px,1fr)_2fr] gap-4">
      <aside
        className="border rounded-lg overflow-hidden"
        data-kit-pane="queue"
        aria-label="Inbox queue"
      >
        <ul className="divide-y" role="list">
          {queue.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              No items in queue
            </li>
          )}
          {queue.map((row) => {
            const selected = row.id === selectedRowId;
            return (
              <li
                key={row.id}
                role="listitem"
                data-row-id={row.id}
                data-selected={selected ? "true" : "false"}
              >
                <button
                  type="button"
                  data-interactive-surface=""
                  data-interactive-outline="preserve"
                  className={`interactive-list-item w-full text-left p-3 focus-visible:ring-2 focus-visible:ring-ring rounded-md ${selected ? "bg-muted/50" : ""}`}
                  onClick={() => selectRow(row.id)}
                >
                  <span className="block text-sm font-medium truncate">
                    {row.title}
                  </span>
                  {row.subtitle && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {row.subtitle}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section
        className="border rounded-lg p-4 min-h-[300px]"
        data-kit-pane="draft"
        aria-label="Draft response"
      >
        {!draft && (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">No draft yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              The drafting blueprint hasn&apos;t produced a response for this row yet.
            </p>
          </div>
        )}
        {draft && (
          <div className="space-y-2">
            <header className="flex items-baseline justify-between border-b pb-2">
              <h3 className="text-sm font-medium">{draft.filename}</h3>
              <span className="text-xs text-muted-foreground">
                Task {draft.taskId.slice(0, 8)}
              </span>
            </header>
            <LightMarkdown content={draft.content} textSize="sm" />
          </div>
        )}
      </section>
    </div>
  );
}
