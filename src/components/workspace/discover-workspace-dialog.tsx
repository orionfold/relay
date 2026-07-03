"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  FolderSearch,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Download,
  Search,
} from "lucide-react";
import type { DiscoveredProject, DiscoveryResult } from "@/lib/environment/discovery";
import { DiscoveryProjectRow } from "./discovery-project-row";
import {
  ImportProgressList,
  type ImportProjectStatus,
} from "./import-progress-list";

type Step = "configure" | "select" | "import";

interface DiscoverWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function DiscoverWorkspaceDialog({
  open,
  onOpenChange,
  onComplete,
}: DiscoverWorkspaceDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("configure");

  // Step 1: Configure
  const [parentDir, setParentDir] = useState("~/Developer");
  const [maxDepth, setMaxDepth] = useState("2");
  const [markerClaude, setMarkerClaude] = useState(true);
  const [markerCodex, setMarkerCodex] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Step 2: Select
  const [discoveryResult, setDiscoveryResult] = useState<DiscoveryResult | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [customNames, setCustomNames] = useState<Map<string, string>>(new Map());
  const [filterQuery, setFilterQuery] = useState("");

  // Step 3: Import
  const [importStatuses, setImportStatuses] = useState<ImportProjectStatus[]>([]);
  const [importCreated, setImportCreated] = useState(0);
  const [importFailed, setImportFailed] = useState(0);
  const [importComplete, setImportComplete] = useState(false);

  // ── Step 1: Discover ──────────────────────────────────────────────

  const handleDiscover = useCallback(async () => {
    const markers: string[] = [];
    if (markerClaude) markers.push("claude");
    if (markerCodex) markers.push("codex");
    if (markers.length === 0) {
      setScanError("Select at least one marker type");
      return;
    }

    setScanning(true);
    setScanError(null);

    try {
      const res = await fetch("/api/workspace/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentDir,
          maxDepth: parseInt(maxDepth, 10),
          markers,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setScanError(data.error || "Discovery failed");
        return;
      }

      const result: DiscoveryResult = await res.json();
      setDiscoveryResult(result);

      // Auto-select new (not already imported) projects
      const newPaths = new Set<string>();
      const names = new Map<string, string>();
      for (const p of result.projects) {
        if (!p.alreadyImported) {
          newPaths.add(p.path);
        }
        names.set(p.path, p.folderName);
      }
      setSelectedPaths(newPaths);
      setCustomNames(names);
      setFilterQuery("");
      setStep("select");
    } catch {
      setScanError("Network error. Is the dev server running?");
    } finally {
      setScanning(false);
    }
  }, [parentDir, maxDepth, markerClaude, markerCodex]);

  // ── Step 2: Selection helpers ──────────────────────────────────────

  const allProjects = discoveryResult?.projects ?? [];
  const newProjects = allProjects.filter((p) => !p.alreadyImported);
  const filteredProjects = filterQuery
    ? allProjects.filter(
        (p) =>
          p.folderName.toLowerCase().includes(filterQuery.toLowerCase()) ||
          p.path.toLowerCase().includes(filterQuery.toLowerCase())
      )
    : allProjects;

  const toggleSelectAll = () => {
    if (selectedPaths.size === newProjects.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(newProjects.map((p) => p.path)));
    }
  };

  // ── Step 3: Import ────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    const toImport = allProjects.filter((p) => selectedPaths.has(p.path));
    if (toImport.length === 0) return;

    // Initialize statuses
    setImportStatuses(
      toImport.map((p) => ({
        name: customNames.get(p.path) || p.folderName,
        status: "pending",
      }))
    );
    setImportCreated(0);
    setImportFailed(0);
    setImportComplete(false);
    setStep("import");

    try {
      const res = await fetch("/api/workspace/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projects: toImport.map((p) => ({
            path: p.path,
            name: customNames.get(p.path) || p.folderName,
          })),
        }),
      });

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "progress") {
              setImportStatuses((prev) => {
                const next = [...prev];
                if (next[event.index]) {
                  next[event.index] = {
                    name: event.name,
                    status: event.status,
                    artifactCount: event.artifactCount,
                    error: event.error,
                  };
                }
                return next;
              });
            }

            if (event.type === "complete") {
              setImportCreated(event.created);
              setImportFailed(event.failed);
              setImportComplete(true);
            }
          } catch {
            // ignore malformed SSE
          }
        }
      }
    } catch {
      setImportComplete(true);
    }
  }, [allProjects, selectedPaths, customNames]);

  const handleDone = () => {
    onOpenChange(false);
    router.refresh();
    onComplete?.();
    // Reset state for next open
    setTimeout(() => {
      setStep("configure");
      setDiscoveryResult(null);
      setImportStatuses([]);
      setImportComplete(false);
    }, 300);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen && step === "import" && !importComplete) return; // prevent close during import
    onOpenChange(isOpen);
    if (!isOpen) {
      setTimeout(() => {
        setStep("configure");
        setDiscoveryResult(null);
        setImportStatuses([]);
        setImportComplete(false);
      }, 300);
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent side="right" className="sm:max-w-lg w-full">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FolderSearch className="h-5 w-5" />
            Discover Workspace
          </SheetTitle>
          <SheetDescription>
            {step === "configure" &&
              "Point to a parent folder to find projects with AI tool configuration."}
            {step === "select" &&
              `Found ${allProjects.length} project${allProjects.length !== 1 ? "s" : ""} in ${discoveryResult?.durationMs ?? 0}ms`}
            {step === "import" && "Creating projects and scanning environments..."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-6 space-y-4 overflow-y-auto flex-1">
          {/* ── STEP 1: CONFIGURE ──────────────────────────────── */}
          {step === "configure" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="parentDir">Parent Directory</Label>
                <Input
                  id="parentDir"
                  value={parentDir}
                  onChange={(e) => setParentDir(e.target.value)}
                  placeholder="~/Developer"
                />
                <p className="text-[11px] text-muted-foreground">
                  We'll search for folders containing .claude/ or .codex/ directories.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Search Depth</Label>
                <RadioGroup
                  value={maxDepth}
                  onValueChange={setMaxDepth}
                  className="flex gap-4"
                >
                  {[
                    { value: "1", label: "1 level" },
                    { value: "2", label: "2 levels" },
                    { value: "3", label: "3 levels" },
                  ].map((opt) => (
                    <div key={opt.value} className="flex items-center gap-1.5">
                      <RadioGroupItem value={opt.value} id={`depth-${opt.value}`} />
                      <Label
                        htmlFor={`depth-${opt.value}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {opt.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Look For</Label>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="marker-claude"
                      checked={markerClaude}
                      onCheckedChange={(c) => setMarkerClaude(c === true)}
                    />
                    <Label
                      htmlFor="marker-claude"
                      className="text-sm font-normal cursor-pointer"
                    >
                      .claude/
                    </Label>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      id="marker-codex"
                      checked={markerCodex}
                      onCheckedChange={(c) => setMarkerCodex(c === true)}
                    />
                    <Label
                      htmlFor="marker-codex"
                      className="text-sm font-normal cursor-pointer"
                    >
                      .codex/
                    </Label>
                  </div>
                </div>
              </div>

              {scanError && (
                <p className="text-sm text-destructive">{scanError}</p>
              )}

              <div className="pt-2">
                <Button
                  onClick={handleDiscover}
                  disabled={scanning || !parentDir.trim()}
                  className="w-full"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-1.5" />
                      Scan Directory
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {/* ── STEP 2: SELECT ──────────────────────────────────── */}
          {step === "select" && (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    checked={
                      newProjects.length > 0 &&
                      selectedPaths.size === newProjects.length
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">
                    Select All ({newProjects.length} new)
                  </span>
                </div>
                <div className="flex-1" />
                <Input
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Filter..."
                  className="h-7 text-xs w-36"
                />
              </div>

              {/* Project list */}
              <div className="space-y-2 max-h-[380px] overflow-y-auto">
                {filteredProjects.map((project) => (
                  <DiscoveryProjectRow
                    key={project.path}
                    project={project}
                    selected={selectedPaths.has(project.path)}
                    customName={customNames.get(project.path) || project.folderName}
                    onSelectChange={(selected) => {
                      setSelectedPaths((prev) => {
                        const next = new Set(prev);
                        if (selected) next.add(project.path);
                        else next.delete(project.path);
                        return next;
                      });
                    }}
                    onNameChange={(name) => {
                      setCustomNames((prev) => {
                        const next = new Map(prev);
                        next.set(project.path, name);
                        return next;
                      });
                    }}
                  />
                ))}

                {filteredProjects.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {filterQuery ? "No projects match filter." : "No projects found."}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("configure")}
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
                <Button
                  size="sm"
                  onClick={handleImport}
                  disabled={selectedPaths.size === 0}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Import {selectedPaths.size} Project{selectedPaths.size !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          )}

          {/* ── STEP 3: IMPORT ──────────────────────────────────── */}
          {step === "import" && (
            <>
              <ImportProgressList
                projects={importStatuses}
                created={importCreated}
                failed={importFailed}
                total={importStatuses.length}
                complete={importComplete}
              />

              {importComplete && (
                <div className="pt-2">
                  <Button onClick={handleDone} className="w-full">
                    Done
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
