"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, LayoutList, Plus, Trash2, Search, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import { TableListTable } from "./table-list-table";
import { TableGrid } from "./table-grid";
import { TableCreateSheet } from "./table-create-sheet";
import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState } from "@/components/shared/empty-state";
import { Table2 } from "lucide-react";
import { packOf } from "@/lib/apps/pack-of";
import type { TableWithRelations } from "./types";

interface TableBrowserProps {
  initialTables: TableWithRelations[];
  projects: { id: string; name: string }[];
  /** Installed packs — marks tables whose project is a pack (FEAT-8). */
  installedPacks?: { id: string; name: string }[];
}

export function TableBrowser({
  initialTables,
  projects,
  installedPacks = [],
}: TableBrowserProps) {
  const [tables, setTables] = useState(initialTables);
  // {projectId → pack name} for pack-installed projects, via the shared
  // resolver (tables associate to a pack by projectId === packId).
  const installedPackIds = new Set(installedPacks.map((p) => p.id));
  const packNameById = new Map(installedPacks.map((p) => [p.id, p.name]));
  const packNameForProject = useCallback(
    (projectId: string | null | undefined): string | null => {
      const packId = packOf(
        { kind: "table", id: "", projectId: projectId ?? undefined },
        installedPackIds
      );
      return packId ? packNameById.get(packId) ?? null : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installedPacks]
  );
  const [view, setView] = useState<"table" | "grid">("table");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/tables");
      if (res.ok) {
        const data = await res.json();
        setTables(data);
      }
    } catch {
      // Silent refresh failure
    }
  }, []);

  const filtered = tables.filter((t) => {
    if (
      search &&
      !t.name.toLowerCase().includes(search.toLowerCase()) &&
      !(t.description ?? "").toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (sourceFilter !== "all" && t.source !== sourceFilter) return false;
    if (projectFilter !== "all" && t.projectId !== projectFilter) return false;
    return true;
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
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const promises = Array.from(selected).map((id) =>
        fetch(`/api/tables/${id}`, { method: "DELETE" })
      );
      await Promise.all(promises);
      toast.success(`Deleted ${selected.size} table(s)`);
      setSelected(new Set());
      await refresh();
    } catch {
      toast.error("Failed to delete tables");
    } finally {
      setDeleting(false);
    }
  }

  const activeFilters = [
    sourceFilter !== "all",
    projectFilter !== "all",
  ].filter(Boolean).length;

  const navigate = (id: string) => router.push(`/tables/${id}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 border rounded-lg p-0.5">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setView("table")}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            onClick={() => setView("grid")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            disabled={deleting}
            onClick={handleBulkDelete}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete ({selected.size})
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push("/schemas")}
        >
          <LayoutTemplate className="h-4 w-4 mr-1" />
          Schemas
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Table
        </Button>
      </div>

      <FilterBar
        activeCount={activeFilters}
        onClear={() => {
          setSourceFilter("all");
          setProjectFilter("all");
        }}
      >
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="imported">Imported</SelectItem>
            <SelectItem value="agent">Agent</SelectItem>
            <SelectItem value="template">Template</SelectItem>
          </SelectContent>
        </Select>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Table2}
          heading="No tables yet"
          description="Create a table to start organizing your structured data, or browse templates for inspiration."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Table
            </Button>
          }
        />
      ) : view === "table" ? (
        <TableListTable
          tables={filtered}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onSelect={navigate}
          onOpen={navigate}
          packNameForProject={packNameForProject}
        />
      ) : (
        <TableGrid
          tables={filtered}
          onSelect={navigate}
          onOpen={navigate}
          packNameForProject={packNameForProject}
        />
      )}

      <TableCreateSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projects}
        onCreated={refresh}
      />
    </div>
  );
}
