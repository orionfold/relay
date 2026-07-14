"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { COLUMN_DATA_TYPES, columnTypeLabel } from "@/lib/constants/table-status";
import type { ColumnDataType } from "@/lib/constants/table-status";

// ── Types ─────────────────────────────────────────────────────────────

interface TableImportWizardProps {
  tableId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

interface DocumentItem {
  id: string;
  name: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

interface InferredColumn {
  name: string;
  displayName: string;
  dataType: ColumnDataType;
  config?: Record<string, unknown>;
}

interface PreviewData {
  headers: string[];
  sampleRows: Record<string, string>[];
  totalRows: number;
  inferredColumns: InferredColumn[];
}

interface ColumnConfig extends InferredColumn {
  skip: boolean;
}

interface ImportResult {
  importId: string;
  rowsImported: number;
  rowsSkipped: number;
  errors: Array<{ row: number; error: string }>;
  columns: InferredColumn[];
}

type Step = "select" | "columns" | "results";

// ── Helpers ───────────────────────────────────────────────────────────

const IMPORTABLE_MIME_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/tab-separated-values",
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mimeLabel(mime: string): string {
  if (mime === "text/csv") return "CSV";
  if (mime === "text/tab-separated-values") return "TSV";
  if (mime.includes("spreadsheetml") || mime.includes("ms-excel")) return "Excel";
  return mime;
}

// ── Component ─────────────────────────────────────────────────────────

export function TableImportWizard({
  tableId,
  open,
  onOpenChange,
  onImported,
}: TableImportWizardProps) {
  const [step, setStep] = useState<Step>("select");
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Preview state
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Column config state
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ── Load documents ──────────────────────────────────────────────────

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      // Filter to importable mime types
      const filtered = (data as DocumentItem[]).filter((doc) =>
        IMPORTABLE_MIME_TYPES.includes(doc.mimeType)
      );
      setDocuments(filtered);
    } catch {
      toast.error("Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadDocuments();
      // Reset state when opening
      setStep("select");
      setSelectedDocId(null);
      setPreview(null);
      setColumnConfigs([]);
      setResult(null);
    }
  }, [open, loadDocuments]);

  // ── Select document and load preview ────────────────────────────────

  async function handleSelectDocument(docId: string) {
    setSelectedDocId(docId);
    setLoadingPreview(true);

    try {
      const res = await fetch(`/api/tables/${tableId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId, preview: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Failed to preview document");
        setSelectedDocId(null);
        return;
      }

      const data: PreviewData = await res.json();
      setPreview(data);
      setColumnConfigs(
        data.inferredColumns.map((col) => ({ ...col, skip: false }))
      );
      setStep("columns");
    } catch {
      toast.error("Failed to preview document");
      setSelectedDocId(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  // ── Run import ──────────────────────────────────────────────────────

  async function handleImport() {
    if (!selectedDocId) return;

    setImporting(true);
    try {
      const mapping = columnConfigs.map((col) => ({
        name: col.name,
        displayName: col.displayName,
        dataType: col.dataType,
        skip: col.skip,
      }));

      const res = await fetch(`/api/tables/${tableId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: selectedDocId,
          columnMapping: mapping,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Import failed");
        return;
      }

      const data: ImportResult = await res.json();
      setResult(data);
      setStep("results");
      toast.success(`Imported ${data.rowsImported} rows`);
    } catch {
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ── Column config helpers ───────────────────────────────────────────

  function toggleColumn(index: number) {
    setColumnConfigs((prev) =>
      prev.map((col, i) =>
        i === index ? { ...col, skip: !col.skip } : col
      )
    );
  }

  function updateColumnType(index: number, dataType: string) {
    setColumnConfigs((prev) =>
      prev.map((col, i) =>
        i === index ? { ...col, dataType: dataType as ColumnDataType } : col
      )
    );
  }

  // ── Render steps ────────────────────────────────────────────────────

  function renderSelectStep() {
    if (loadingDocs) {
      return (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading documents...
        </div>
      );
    }

    if (documents.length === 0) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">No importable documents</p>
          <p className="text-xs mt-1">
            Upload a CSV, TSV, or Excel file first via the Documents page.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground mb-3">
          Select a document to import data from.
        </p>
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => handleSelectDocument(doc.id)}
            disabled={loadingPreview}
            className={`w-full text-left p-3 rounded-lg border transition-colors
              ${selectedDocId === doc.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/50"
              }
              ${loadingPreview ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{doc.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatSize(doc.fileSize)}
                </p>
              </div>
              <Badge variant="secondary" className="ml-2 shrink-0">
                {mimeLabel(doc.mimeType)}
              </Badge>
            </div>
          </button>
        ))}

        {loadingPreview && (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Analyzing document...
          </div>
        )}
      </div>
    );
  }

  function renderColumnsStep() {
    if (!preview) return null;

    const activeCount = columnConfigs.filter((c) => !c.skip).length;

    return (
      <div className="space-y-4">
        {/* Preview table */}
        <div>
          <p className="text-sm font-medium mb-2">
            Preview ({preview.totalRows} rows total)
          </p>
          <div className="border rounded-lg overflow-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  {preview.headers.map((h) => (
                    <th
                      key={h}
                      className="px-2 py-1.5 text-left font-medium whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.sampleRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {preview.headers.map((h) => (
                      <td
                        key={h}
                        className="px-2 py-1 whitespace-nowrap max-w-[200px] truncate"
                      >
                        {row[h] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Column configuration */}
        <div>
          <p className="text-sm font-medium mb-2">
            Columns ({activeCount} of {columnConfigs.length} selected)
          </p>
          <div className="space-y-2">
            {columnConfigs.map((col, i) => (
              <div
                key={col.name}
                className={`flex items-center gap-3 p-2 rounded-lg border ${
                  col.skip ? "opacity-50 bg-muted/30" : ""
                }`}
              >
                <Checkbox
                  checked={!col.skip}
                  onCheckedChange={() => toggleColumn(i)}
                />
                <span className="text-sm font-medium min-w-[120px] truncate">
                  {col.displayName}
                </span>
                <Select
                  value={col.dataType}
                  onValueChange={(v) => updateColumnType(i, v)}
                  disabled={col.skip}
                >
                  <SelectTrigger className="w-[120px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_DATA_TYPES.filter(
                      (dt) => dt !== "relation" && dt !== "computed"
                    ).map((dt) => (
                      <SelectItem key={dt} value={dt}>
                        {columnTypeLabel[dt]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {col.config?.options != null && (
                  <span className="text-xs text-muted-foreground">
                    {(col.config.options as string[]).length} options
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function renderResultsStep() {
    if (!result) return null;

    const hasErrors = result.rowsSkipped > 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 py-4">
          {hasErrors ? (
            <AlertCircle className="h-8 w-8 text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium">
              {hasErrors ? "Import completed with warnings" : "Import successful"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {result.rowsImported} rows imported
              {result.rowsSkipped > 0 && `, ${result.rowsSkipped} skipped`}
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Rows Imported</p>
            <p className="text-lg font-semibold">{result.rowsImported}</p>
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-xs text-muted-foreground">Columns</p>
            <p className="text-lg font-semibold">{result.columns.length}</p>
          </div>
        </div>

        {/* Errors */}
        {result.errors.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 text-amber-600">
              Errors ({result.errors.length})
            </p>
            <div className="border rounded-lg overflow-auto max-h-32">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-2 py-1.5 text-left font-medium">Row</th>
                    <th className="px-2 py-1.5 text-left font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((err, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-2 py-1 text-muted-foreground">{err.row}</td>
                      <td className="px-2 py-1">{err.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step title + navigation ─────────────────────────────────────────

  const stepTitles: Record<Step, string> = {
    select: "Import Data - Select Document",
    columns: "Import Data - Configure Columns",
    results: "Import Data - Results",
  };

  function handleClose() {
    if (result) {
      onImported();
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-[540px] sm:max-w-[540px]">
        <SheetHeader>
          <SheetTitle>{stepTitles[step]}</SheetTitle>
        </SheetHeader>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto flex-1">
          {step === "select" && renderSelectStep()}
          {step === "columns" && renderColumnsStep()}
          {step === "results" && renderResultsStep()}
        </div>

        <SheetFooter className="px-6">
          {step === "select" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}

          {step === "columns" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("select");
                  setSelectedDocId(null);
                  setPreview(null);
                }}
                disabled={importing}
              >
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  importing ||
                  columnConfigs.every((c) => c.skip)
                }
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Importing...
                  </>
                ) : (
                  `Import ${preview?.totalRows ?? 0} Rows`
                )}
              </Button>
            </>
          )}

          {step === "results" && (
            <Button onClick={handleClose}>Done</Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
