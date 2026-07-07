---
id: TDR-017
title: Document processor registry with MIME-to-processor mapping
date: 2026-03-30
status: accepted
category: agent-system
---

# TDR-017: Document processor registry with MIME-to-processor mapping

## Context

Users upload various file types (text, PDF, images, Office docs, spreadsheets) that agents need to reference during task execution. Each type requires different extraction logic.

## Decision

A processor registry maps MIME types to processor functions. Each processor extracts text content and metadata from the uploaded file. Processing is fire-and-forget (triggered on upload, results stored in documents table). Extracted text stored in documents.extractedText, processing errors in documents.processingError.

## Consequences

- Adding a new file type requires only writing a processor function and registering its MIME types.
- Consistent interface for all document types.
- Extracted text is pre-computed (no extraction latency during agent execution).
- Processing errors don't block upload — document is available with reduced context.

## Alternatives Considered

- **On-demand extraction during agent execution** — latency, repeated work.
- **External processing service** — complexity.
- **Single generic text extractor** — poor quality for PDFs/Office.

## References

- `src/lib/documents/processor.ts`
- `src/lib/documents/registry.ts`
- `src/lib/documents/processors/` (text, pdf, image, office, spreadsheet)
