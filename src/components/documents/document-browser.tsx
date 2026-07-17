"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, LayoutList, Upload, Trash2 } from "lucide-react";
import { FilterInput } from "@/components/shared/filter-input";
import { parseFilterInput, matchesClauses, type FilterClause } from "@/lib/filters/parse";
import { toast } from "sonner";
import { DocumentTable } from "./document-table";
import { DocumentGrid } from "./document-grid";
import { DocumentUploadDialog } from "./document-upload-dialog";
import { FilterBar } from "@/components/shared/filter-bar";
import type { DocumentWithRelations } from "./types";

interface DocumentBrowserProps {
  initialDocuments: DocumentWithRelations[];
  projects: { id: string; name: string }[];
}

export function DocumentBrowser({
  initialDocuments,
  projects,
}: DocumentBrowserProps) {
  const [docs, setDocs] = useState(initialDocuments);
  const [view, setView] = useState<"table" | "grid">("table");
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") ?? "";
  const initialParsed = parseFilterInput(initialFilter);
  const [filterRaw, setFilterRaw] = useState(initialFilter);
  const [rawQuery, setRawQuery] = useState(initialParsed.rawQuery);
  const [clauses, setClauses] = useState<FilterClause[]>(initialParsed.clauses);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const requestedProjectId = searchParams.get("projectId");
  const [projectFilter, setProjectFilter] = useState<string>(() =>
    requestedProjectId && projects.some((project) => project.id === requestedProjectId)
      ? requestedProjectId
      : "all"
  );
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const uploadButtonRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      } else {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? `Could not refresh documents (${res.status})`);
      }
    } catch {
      toast.error("Could not refresh documents. Check the Relay connection.");
    }
  }, []);

  const filtered = docs.filter((doc) => {
    if (
      rawQuery &&
      !doc.originalName.toLowerCase().includes(rawQuery.toLowerCase()) &&
      !(doc.extractedText ?? "").toLowerCase().includes(rawQuery.toLowerCase())
    ) {
      return false;
    }
    if (statusFilter !== "all" && doc.status !== statusFilter) return false;
    if (directionFilter !== "all" && doc.direction !== directionFilter) return false;
    if (projectFilter !== "all" && doc.projectId !== projectFilter) return false;
    return matchesClauses(doc, clauses, {
      status: (d, v) => (d.status ?? "").toLowerCase() === v.toLowerCase(),
      direction: (d, v) => (d.direction ?? "").toLowerCase() === v.toLowerCase(),
      type: (d, v) => (d.mimeType ?? "").toLowerCase().includes(v.toLowerCase()),
    });
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.id)));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    let deleted = 0;
    for (const id of selected) {
      try {
        const res = await fetch(`/api/documents/${id}?cascadeDelete=true`, { method: "DELETE" });
        if (res.ok) deleted++;
      } catch {
        // Continue with remaining
      }
    }
    toast.success(`Deleted ${deleted} document${deleted !== 1 ? "s" : ""}`);
    setSelected(new Set());
    setDeleting(false);
    await refresh();
  }

  return (
    <>
      <div className="flex justify-end">
        <Button ref={uploadButtonRef} onClick={() => setUploadOpen(true)} size="sm">
          <Upload className="h-4 w-4 mr-1.5" />
          Upload
        </Button>
      </div>

      <FilterBar
        activeCount={
          (filterRaw ? 1 : 0) +
          (statusFilter !== "all" ? 1 : 0) +
          (directionFilter !== "all" ? 1 : 0) +
          (projectFilter !== "all" ? 1 : 0)
        }
        onClear={() => {
          setFilterRaw("");
          setRawQuery("");
          setClauses([]);
          setStatusFilter("all");
          setDirectionFilter("all");
          setProjectFilter("all");
          router.replace("?", { scroll: false });
        }}
      >
        <FilterInput
          value={filterRaw}
          onChange={({ raw, clauses, rawQuery }) => {
            setFilterRaw(raw);
            setClauses(clauses);
            setRawQuery(rawQuery);
            const params = new URLSearchParams(searchParams.toString());
            if (raw) params.set("filter", raw);
            else params.delete("filter");
            const query = params.toString();
            router.replace(query ? `?${query}` : "?", { scroll: false });
          }}
          placeholder="Search or #status:ready #type:pdf …"
        />

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="uploaded">Uploaded</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Select value={directionFilter} onValueChange={setDirectionFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All directions</SelectItem>
            <SelectItem value="input">Inputs</SelectItem>
            <SelectItem value="output">Outputs</SelectItem>
          </SelectContent>
        </Select>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 border border-border rounded-md p-0.5">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setView("table")}
            aria-label="Table view"
          >
            <LayoutList className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setView("grid")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
        </div>

        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={deleting}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete {selected.size}
          </Button>
        )}
      </FilterBar>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          {docs.length === 0 ? (
            <>
              <p className="text-lg font-medium mb-1">No documents yet</p>
              <p className="text-sm">Upload files to get started.</p>
            </>
          ) : (
            <>
              <p className="text-lg font-medium mb-1">No matching documents</p>
              <p className="text-sm">Try adjusting your filters or search.</p>
            </>
          )}
        </div>
      ) : view === "table" ? (
        <DocumentTable
          documents={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onOpen={(doc) => router.push(`/documents/${doc.id}`)}
        />
      ) : (
        <DocumentGrid
          documents={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          onOpen={(doc) => router.push(`/documents/${doc.id}`)}
        />
      )}

      <DocumentUploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={refresh}
        restoreFocusElement={uploadButtonRef.current}
        projects={projects}
        defaultProjectId={projectFilter === "all" ? null : projectFilter}
      />
    </>
  );
}
