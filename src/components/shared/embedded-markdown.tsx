import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROSE_NOTIFICATION, PROSE_READER } from "@/lib/constants/prose-styles";

export type MarkdownHierarchy = "embedded" | "compact" | "document";

interface EmbeddedMarkdownProps {
  content: string;
  hierarchy?: MarkdownHierarchy;
  className?: string;
}

interface MarkdownSegment {
  kind: "markdown" | "insight";
  content: string;
}

const INSIGHT_OPEN = /^\s*`?\s*[★•]\s*Insight\s*[─-]{3,}\s*`?\s*$/i;
const INSIGHT_CLOSE = /^\s*`?\s*[─-]{3,}\s*`?\s*$/;

export function parseInsightSegments(content: string): MarkdownSegment[] {
  const lines = content.split("\n");
  const segments: MarkdownSegment[] = [];
  let markdownStart = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (!INSIGHT_OPEN.test(lines[index])) continue;
    const closeIndex = lines.findIndex(
      (line, candidate) => candidate > index && INSIGHT_CLOSE.test(line),
    );
    if (closeIndex === -1) continue;

    const before = lines.slice(markdownStart, index).join("\n").trim();
    const insight = lines.slice(index + 1, closeIndex).join("\n").trim();
    if (before) segments.push({ kind: "markdown", content: before });
    if (insight) segments.push({ kind: "insight", content: insight });
    markdownStart = closeIndex + 1;
    index = closeIndex;
  }

  const after = lines.slice(markdownStart).join("\n").trim();
  if (after) segments.push({ kind: "markdown", content: after });
  return segments.length > 0 ? segments : [{ kind: "markdown", content }];
}

function markdownComponents(hierarchy: MarkdownHierarchy): Components {
  return {
    h1: ({ children }) => hierarchy === "compact" ? (
      <h5 className="mb-1.5 mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h5>
    ) : hierarchy === "embedded" ? (
      <h3 className="mb-2 mt-5 text-base font-semibold text-foreground first:mt-0">{children}</h3>
    ) : (
      <h2>{children}</h2>
    ),
    h2: ({ children }) => hierarchy === "compact" ? (
      <h6 className="mb-1 mt-2.5 text-xs font-semibold text-foreground first:mt-0">{children}</h6>
    ) : hierarchy === "embedded" ? (
      <h4 className="mb-1.5 mt-4 text-sm font-semibold text-foreground first:mt-0">{children}</h4>
    ) : (
      <h3>{children}</h3>
    ),
    h3: ({ children }) => hierarchy === "compact" ? (
      <p className="mb-1 mt-2 text-xs font-medium text-foreground first:mt-0">{children}</p>
    ) : hierarchy === "embedded" ? (
      <h5 className="mb-1 mt-3 text-sm font-medium text-foreground first:mt-0">{children}</h5>
    ) : (
      <h4>{children}</h4>
    ),
    a: ({ href, children }) => {
      if (!href) return <span>{children}</span>;
      const external = !href.startsWith("/") && !href.startsWith("#");
      return (
        <a
          href={href}
          className="text-primary underline underline-offset-2 hover:text-primary/80"
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {children}
        </a>
      );
    },
    pre: ({ children }) => (
      <pre className="surface-scroll overflow-x-auto rounded-lg p-3 text-xs">{children}</pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-2 border-border pl-3 text-muted-foreground">
        {children}
      </blockquote>
    ),
  };
}

function MarkdownBlock({
  content,
  hierarchy,
}: {
  content: string;
  hierarchy: MarkdownHierarchy;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents(hierarchy)}
      urlTransform={defaultUrlTransform}
    >
      {content}
    </ReactMarkdown>
  );
}

export function EmbeddedMarkdown({
  content,
  hierarchy = "embedded",
  className,
}: EmbeddedMarkdownProps) {
  const segments = parseInsightSegments(content);
  return (
    <div
      className={cn(
        hierarchy === "document" ? PROSE_READER : PROSE_NOTIFICATION,
        "break-words",
        className,
      )}
    >
      {segments.map((segment, index) => segment.kind === "insight" ? (
        <aside
          key={`${segment.kind}-${index}`}
          role="note"
          aria-label="Insight"
          className="not-prose my-4 rounded-lg border border-primary/25 bg-primary/8 p-3 text-sm"
        >
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Insight
          </div>
          <div className={cn(PROSE_NOTIFICATION, "text-foreground")}>
            <MarkdownBlock
              content={segment.content}
              hierarchy={hierarchy === "document" ? "embedded" : hierarchy}
            />
          </div>
        </aside>
      ) : (
        <MarkdownBlock
          key={`${segment.kind}-${index}`}
          content={segment.content}
          hierarchy={hierarchy}
        />
      ))}
    </div>
  );
}
