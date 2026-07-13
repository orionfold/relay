"use client";

import { memo } from "react";
import { Loader2, Download, FileQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { ImageZoomView } from "./image-zoom-view";
import { SmartExtractedText } from "./smart-extracted-text";
import { EmbeddedMarkdown } from "@/components/shared/embedded-markdown";
import {
  isMarkdown,
  isCode,
  isPlainText,
  isPdf,
  isImage,
  getLanguageLabel,
} from "./utils";
import { PROSE_READER } from "@/lib/constants/prose-styles";
import type { DocumentWithRelations } from "./types";

interface DocumentContentRendererProps {
  doc: DocumentWithRelations;
}

function DocumentContentRendererInner({ doc }: DocumentContentRendererProps) {
  const fileUrl = `/api/documents/${doc.id}/file?inline=1`;

  // Tier 0: Processing status
  if (doc.status === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Processing document...</p>
      </div>
    );
  }

  // Tier 0: Error status
  if (doc.status === "error") {
    return (
      <ErrorState
        heading="Processing failed"
        description={doc.processingError ?? "An unknown error occurred while processing this document."}
      />
    );
  }

  // Tier 1: Markdown — full render, no truncation
  if (isMarkdown(doc.mimeType) && doc.extractedText) {
    return <EmbeddedMarkdown content={doc.extractedText} hierarchy="document" />;
  }

  // Tier 1: Code — monospace with language label
  if (isCode(doc.mimeType) && doc.extractedText) {
    return (
      <div className="relative">
        <Badge
          variant="secondary"
          className="absolute top-3 right-3 text-xs"
        >
          {getLanguageLabel(doc.mimeType)}
        </Badge>
        <pre className="font-mono text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap break-words">
          {doc.extractedText}
        </pre>
      </div>
    );
  }

  // Tier 1: Plain text — flowing prose paragraphs
  if (isPlainText(doc.mimeType) && doc.extractedText) {
    const paragraphs = doc.extractedText.split(/\n{2,}/).filter(Boolean);
    return (
      <div className={`${PROSE_READER} space-y-4`}>
        {paragraphs.map((p, i) => (
          <p key={i} className="whitespace-pre-wrap">
            {p}
          </p>
        ))}
      </div>
    );
  }

  // Tier 2: PDF — full-height iframe
  if (isPdf(doc.mimeType)) {
    return (
      <div className="rounded-lg overflow-hidden border border-border">
        <iframe
          src={fileUrl}
          className="w-full min-h-[60vh] md:min-h-[80vh]"
          title={doc.originalName}
          onError={() => {
            // iframe onerror doesn't fire reliably — the fallback link below covers this
          }}
        />
        <div className="p-3 bg-muted/30 text-center">
          <a
            href={`/api/documents/${doc.id}/file`}
            download
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            PDF not loading? Download instead
          </a>
        </div>
      </div>
    );
  }

  // Tier 2: Image — full size with zoom
  if (isImage(doc.mimeType)) {
    return <ImageZoomView src={fileUrl} alt={doc.originalName} />;
  }

  // Tier 3: Other with extracted text — smart formatting
  if (doc.extractedText) {
    return <SmartExtractedText text={doc.extractedText} />;
  }

  // Tier 4: Fallback — no content available
  return (
    <EmptyState
      icon={FileQuestion}
      heading="No preview available"
      description="This file type can't be previewed. Download it to view the contents."
      action={
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/documents/${doc.id}/file`} download>
            <Download className="h-3.5 w-3.5 mr-1" />
            Download File
          </a>
        </Button>
      }
    />
  );
}

export const DocumentContentRenderer = memo(DocumentContentRendererInner);
