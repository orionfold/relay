"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROSE_READER } from "@/lib/constants/prose-styles";

interface SmartExtractedTextProps {
  text: string;
}

function smartFormat(text: string): string {
  const lines = text.split("\n");
  const formatted = lines.map((line) => {
    const trimmed = line.trim();
    // Detect ALL CAPS headings: 2+ space-separated words, 5-80 chars, mostly uppercase
    if (
      trimmed.length >= 5 &&
      trimmed.length <= 80 &&
      trimmed.split(/\s+/).length >= 2 &&
      trimmed === trimmed.toUpperCase() &&
      /[A-Z]/.test(trimmed)
    ) {
      return `\n## ${trimmed}\n`;
    }
    return line;
  });

  // Normalize excessive blank lines (3+ → 2)
  return formatted.join("\n").replace(/\n{3,}/g, "\n\n");
}

export function SmartExtractedText({ text }: SmartExtractedTextProps) {
  const formatted = smartFormat(text);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground italic">
        Extracted text. Original formatting may differ
      </p>
      <div className={PROSE_READER}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {formatted}
        </ReactMarkdown>
      </div>
    </div>
  );
}
