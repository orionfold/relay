import { Separator } from "@/components/ui/separator";
import { LightMarkdown } from "@/components/shared/light-markdown";
import { ExpandableResult } from "@/components/workflows/shared/step-result";

interface TaskResultRendererProps {
  description: string | null;
  result: string | null;
  status: string;
}

export function TaskResultRenderer({ description, result, status }: TaskResultRendererProps) {
  if (!description && !result) return null;

  return (
    <div className="prose-reader-surface">
      {description && (
        <LightMarkdown content={description} textSize="sm" />
      )}
      {description && result && <Separator className="my-4" />}
      {result && (
        status === "failed" ? (
          <pre className="text-xs text-destructive bg-destructive/5 p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap">
            {result}
          </pre>
        ) : (
          <ExpandableResult result={result} />
        )
      )}
    </div>
  );
}
