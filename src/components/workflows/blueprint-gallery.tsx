"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Search, Layers, Plus } from "lucide-react";
import { patternLabels } from "@/lib/constants/status-colors";
import { IconCircle, getWorkflowIconFromName } from "@/lib/constants/card-icons";
import { PackPill } from "@/components/shared/pack-pill";
import { packOf } from "@/lib/apps/pack-of";
import type { WorkflowBlueprint } from "@/lib/workflows/blueprints/types";

/** {id, name} of an installed pack — fetched from /api/apps for provenance. */
interface InstalledPack {
  id: string;
  name: string;
}

const difficultyColors: Record<string, string> = {
  beginner: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
  intermediate: "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  advanced: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
};

export function BlueprintGallery() {
  const router = useRouter();
  const [blueprints, setBlueprints] = useState<WorkflowBlueprint[]>([]);
  const [installedPacks, setInstalledPacks] = useState<InstalledPack[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<"all" | "work" | "personal">("all");
  // FEAT-7 — "all" or a specific installed pack id.
  const [packFilter, setPackFilter] = useState<string>("all");

  useEffect(() => {
    // Blueprints + installed packs in parallel; the pack list resolves each
    // blueprint's provenance (packOf) for the pill (FEAT-8) and filter (FEAT-7).
    Promise.all([
      fetch("/api/blueprints").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/apps").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([bps, apps]) => {
        setBlueprints(bps);
        setInstalledPacks(
          (apps as Array<{ id: string; name: string }>).map((a) => ({
            id: a.id,
            name: a.name,
          }))
        );
      })
      .finally(() => setLoaded(true));
  }, []);

  const packNameById = useMemo(
    () => new Map(installedPacks.map((p) => [p.id, p.name])),
    [installedPacks]
  );
  const installedPackIds = useMemo(
    () => new Set(installedPacks.map((p) => p.id)),
    [installedPacks]
  );
  const packIdFor = (bp: WorkflowBlueprint) =>
    packOf({ kind: "blueprint", id: bp.id }, installedPackIds);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return blueprints.filter((bp) => {
      if (domainFilter !== "all" && bp.domain !== domainFilter) return false;
      if (packFilter !== "all") {
        if (packOf({ kind: "blueprint", id: bp.id }, installedPackIds) !== packFilter)
          return false;
      }
      if (!q) return true;
      return (
        bp.name.toLowerCase().includes(q) ||
        bp.description.toLowerCase().includes(q) ||
        bp.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [blueprints, search, domainFilter, packFilter, installedPackIds]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Blueprints</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pre-configured workflow templates. Select one, fill in variables, and create a ready-to-run workflow.
          </p>
        </div>
        <Button onClick={() => router.push("/blueprints/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Create Custom
        </Button>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search blueprints..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Tabs
          value={domainFilter}
          onValueChange={(v) => setDomainFilter(v as "all" | "work" | "personal")}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="work">Work</TabsTrigger>
            <TabsTrigger value="personal">Personal</TabsTrigger>
          </TabsList>
        </Tabs>
        {/* FEAT-7 — filter by installed pack. Only shown when a pack is
            installed, so the control never appears empty on a fresh instance. */}
        {installedPacks.length > 0 && (
          <select
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            aria-label="Filter by pack"
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All packs</option>
            {installedPacks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Grid */}
      {!loaded ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Layers}
          heading="No blueprints found"
          description="Try adjusting your search or filter."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((bp) => (
            <Card
              key={bp.id}
              tabIndex={0}
              className="cursor-pointer transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
              onClick={() => router.push(`/blueprints/${bp.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  router.push(`/blueprints/${bp.id}`);
                }
              }}
            >
              <CardHeader className="pb-1">
                <div className="flex items-center gap-3">
                  <IconCircle
                    icon={getWorkflowIconFromName(bp.name, bp.pattern).icon}
                    colors={getWorkflowIconFromName(bp.name, bp.pattern).colors}
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between">
                    <CardTitle className="truncate text-sm font-medium">
                      {bp.name}
                    </CardTitle>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant={bp.domain === "work" ? "default" : "secondary"}>
                        {bp.domain}
                      </Badge>
                      {bp.difficulty && (
                        <Badge variant="outline" className={`text-xs ${difficultyColors[bp.difficulty] ?? ""}`}>
                          {bp.difficulty}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {bp.description}
                </p>
                {(() => {
                  const packId = packIdFor(bp);
                  const packName = packId ? packNameById.get(packId) : null;
                  return packName ? (
                    <div className="mt-2">
                      <PackPill packName={packName} />
                    </div>
                  ) : null;
                })()}
                <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span>{patternLabels[bp.pattern] ?? bp.pattern}</span>
                  <span>&middot;</span>
                  <span>{bp.steps.length} steps</span>
                  {bp.estimatedDuration && (
                    <>
                      <span>&middot;</span>
                      <span>{bp.estimatedDuration}</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
