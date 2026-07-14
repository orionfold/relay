"use client";

import { memo, useMemo, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenshotLightbox } from "@/components/shared/screenshot-lightbox";
import type { ScreenshotAttachment } from "@/lib/chat/types";
import type { Components } from "react-markdown";

interface ChatMessageMarkdownProps {
  content: string;
  attachments?: ScreenshotAttachment[];
}

function InlineScreenshot({ attachment }: { attachment: ScreenshotAttachment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="relative rounded-lg overflow-hidden border border-border hover:border-primary transition-colors group my-3 block w-full"
        onClick={() => setOpen(true)}
      >
        <img
          src={attachment.thumbnailUrl}
          alt={`Screenshot ${attachment.width}×${attachment.height}`}
          className="object-contain w-full"
          style={{ maxHeight: 400 }}
          loading="lazy"
          onError={(e) => {
            const img = e.currentTarget;
            if (!img.src.includes(attachment.originalUrl)) {
              img.src = attachment.originalUrl;
            } else {
              img.style.display = "none";
              img.parentElement?.classList.add("bg-muted");
            }
          }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ImageIcon className="h-5 w-5 text-white opacity-0 group-hover:opacity-70 transition-opacity" />
        </div>
        <span className="absolute bottom-1 right-1 text-[9px] bg-black/50 text-white px-1.5 py-0.5 rounded">
          {attachment.width}×{attachment.height}
        </span>
      </button>
      {open && (
        <ScreenshotLightbox
          open={open}
          onClose={() => setOpen(false)}
          imageUrl={attachment.originalUrl}
          width={attachment.width}
          height={attachment.height}
        />
      )}
    </>
  );
}

function CodeBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match?.[1];
  const code = String(children).replace(/\n$/, "");

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  if (!className) {
    // Inline code
    return (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  }

  // Block code
  return (
    <div className="relative group my-3 rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{language ?? "code"}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  code: ({ children, className }) => (
    <CodeBlock className={className}>{children}</CodeBlock>
  ),
  h1: ({ children }) => (
    <h3 className="text-sm font-semibold mt-4 mb-2">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-sm font-semibold mt-3 mb-1.5">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-sm font-semibold mt-2 mb-1">{children}</h4>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => <li className="text-sm">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-border pl-3 my-2 text-muted-foreground italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full text-sm border-collapse border border-border">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-border bg-muted/50 px-3 py-1.5 text-left font-medium">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-3 py-1.5">{children}</td>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:text-primary/80"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="my-3 border-border" />,
};

export const ChatMessageMarkdown = memo(function ChatMessageMarkdown({
  content,
  attachments,
}: ChatMessageMarkdownProps) {
  // Resolve markdown img refs back to their full attachment record so the
  // inline thumbnail can open the lightbox at the original resolution.
  const attachmentBySrc = useMemo(() => {
    const map = new Map<string, ScreenshotAttachment>();
    for (const att of attachments ?? []) {
      map.set(att.thumbnailUrl, att);
      map.set(att.originalUrl, att);
    }
    return map;
  }, [attachments]);

  const componentsWithImg: Components = useMemo(
    () => ({
      ...components,
      img: ({ src, alt }) => {
        const key = typeof src === "string" ? src : "";
        const att = attachmentBySrc.get(key);
        if (att) {
          return <InlineScreenshot attachment={att} />;
        }
        return <img src={key} alt={alt ?? ""} className="max-w-full rounded my-2" />;
      },
    }),
    [attachmentBySrc]
  );

  return (
    <div className="prose-chat">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsWithImg}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
