"use client";

import { useState } from "react";
import {
  Github,
  Loader2,
  Search,
  Check,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Download,
  Package,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface DiscoveredSkill {
  name: string;
  path: string;
  format: "ainative" | "skillmd-only" | "unknown";
  hasProfileYaml: boolean;
  hasSkillMd: boolean;
  hasSkillMdTmpl: boolean;
  hasReadme: boolean;
  description: string;
  frontmatter: Record<string, string>;
}

interface ScanResult {
  owner: string;
  repo: string;
  branch: string;
  commitSha: string;
  repoReadme: string;
  discoveredSkills: DiscoveredSkill[];
  scanDurationMs: number;
}

interface DedupInfo {
  status: "new" | "exact-match" | "near-match";
  matchReason?: string;
  similarity?: number;
  matchedProfileId?: string;
  matchedProfileName?: string;
}

interface PreviewItem {
  skill: DiscoveredSkill;
  config: {
    id: string;
    name: string;
    version: string;
    domain: string;
    tags: string[];
    author?: string;
    allowedTools?: string[];
    importMeta?: Record<string, string>;
  } | null;
  skillMd: string | null;
  dedup: DedupInfo | null;
  error: string | null;
}

type ImportAction = "import" | "replace" | "copy" | "skip";

interface RepoImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function RepoImportWizard({
  open,
  onOpenChange,
  onImported,
}: RepoImportWizardProps) {
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 result
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  // Step 2 state
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Step 3 state
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [actions, setActions] = useState<Map<string, ImportAction>>(new Map());

  // Step 4 state
  const [importResult, setImportResult] = useState<{
    imported: number;
    replaced: number;
    skipped: number;
    profileIds: string[];
    errors?: string[];
  } | null>(null);

  function reset() {
    setStep(1);
    setUrl("");
    setLoading(false);
    setError(null);
    setScanResult(null);
    setSelectedPaths(new Set());
    setPreviews([]);
    setActions(new Map());
    setImportResult(null);
  }

  // Step 1: Scan repo
  async function handleScan() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/agents/import-repo/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Scan failed");
        return;
      }

      setScanResult(data);
      // Auto-select all skills
      setSelectedPaths(new Set(data.discoveredSkills.map((s: DiscoveredSkill) => s.path)));
      setStep(2);
    } catch {
      setError("Failed to connect to scan API");
    } finally {
      setLoading(false);
    }
  }

  // Step 2 → 3: Preview selected skills
  async function handlePreview() {
    if (!scanResult || selectedPaths.size === 0) return;
    setLoading(true);
    setError(null);

    try {
      const selectedSkills = scanResult.discoveredSkills.filter((s) =>
        selectedPaths.has(s.path)
      );

      const res = await fetch("/api/agents/import-repo/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: scanResult.owner,
          repo: scanResult.repo,
          branch: scanResult.branch,
          commitSha: scanResult.commitSha,
          repoUrl: url.trim(),
          repoReadme: scanResult.repoReadme,
          skills: selectedSkills,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Preview failed");
        return;
      }

      setPreviews(data.previews);
      // Set default actions based on dedup status
      const newActions = new Map<string, ImportAction>();
      for (const preview of data.previews as PreviewItem[]) {
        if (!preview.config) continue;
        const id = preview.config.id;
        if (preview.dedup?.status === "exact-match") {
          newActions.set(id, "skip");
        } else if (preview.dedup?.status === "near-match") {
          newActions.set(id, "import");
        } else {
          newActions.set(id, "import");
        }
      }
      setActions(newActions);
      setStep(3);
    } catch {
      setError("Failed to fetch preview data");
    } finally {
      setLoading(false);
    }
  }

  // Step 3 → 4: Confirm import
  async function handleConfirm() {
    if (!scanResult || previews.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const imports = previews
        .filter((p) => p.config && p.skillMd)
        .map((p) => {
          const action = actions.get(p.config!.id) ?? "skip";
          const config = { ...p.config! };

          // For "copy" action, append suffix to avoid ID collision
          if (action === "copy") {
            config.id = `${config.id}-imported`;
            config.name = `${config.name} (Imported)`;
          }

          return {
            config,
            skillMd: p.skillMd!,
            action: action === "copy" ? "import" : action,
          };
        });

      const res = await fetch("/api/agents/import-repo/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repoUrl: url.trim(),
          owner: scanResult.owner,
          repo: scanResult.repo,
          branch: scanResult.branch,
          commitSha: scanResult.commitSha,
          imports,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Import failed");
        return;
      }

      setImportResult(data);
      setStep(4);
      toast.success(`Imported ${data.imported + data.replaced} profiles`);
    } catch {
      setError("Failed to execute import");
    } finally {
      setLoading(false);
    }
  }

  function toggleAll(checked: boolean) {
    if (!scanResult) return;
    if (checked) {
      setSelectedPaths(new Set(scanResult.discoveredSkills.map((s) => s.path)));
    } else {
      setSelectedPaths(new Set());
    }
  }

  function toggleSkill(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const actionCounts = (() => {
    let imp = 0, rep = 0, skip = 0;
    for (const [, action] of actions) {
      if (action === "import" || action === "copy") imp++;
      else if (action === "replace") rep++;
      else skip++;
    }
    return { import: imp, replace: rep, skip };
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Import from Repository
          </DialogTitle>
          <DialogDescription>
            {step === 1 && "Enter a GitHub repository URL to discover importable skills."}
            {step === 2 && `Found ${scanResult?.discoveredSkills.length ?? 0} skills. Select which to import.`}
            {step === 3 && "Review each skill and choose an import action."}
            {step === 4 && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 px-1">
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 min-h-0">
          {/* Step 1: Enter URL */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="repo-url" className="flex items-center gap-1.5">
                  <Github className="h-3.5 w-3.5 text-muted-foreground" />
                  GitHub Repository URL
                </Label>
                <Input
                  id="repo-url"
                  placeholder="https://github.com/owner/repo"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !loading) handleScan();
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Orionfold Relay will scan for all directories containing SKILL.md files.
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Select skills */}
          {step === 2 && scanResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Github className="h-4 w-4" />
                  <span className="font-medium text-foreground">
                    {scanResult.owner}/{scanResult.repo}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {scanResult.branch}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="select-all"
                    checked={selectedPaths.size === scanResult.discoveredSkills.length}
                    onCheckedChange={(checked) => toggleAll(!!checked)}
                  />
                  <Label htmlFor="select-all" className="text-xs">
                    Select all ({scanResult.discoveredSkills.length})
                  </Label>
                </div>
              </div>

              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {scanResult.discoveredSkills.map((skill) => (
                  <label
                    key={skill.path}
                    className="flex items-start gap-3 surface-card-muted rounded-lg border border-border/60 p-3 hover:border-primary/40 transition-colors"
                  >
                    <Checkbox
                      checked={selectedPaths.has(skill.path)}
                      onCheckedChange={() => toggleSkill(skill.path)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{skill.name}</span>
                        <Badge
                          variant={skill.format === "ainative" ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {skill.format === "ainative" ? "Relay" : "SKILL.md"}
                        </Badge>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {skill.description}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {skill.path || "(root)"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Preview & Dedup */}
          {step === 3 && (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {previews.map((preview) => {
                if (!preview.config) {
                  return (
                    <div
                      key={preview.skill.path}
                      className="surface-card-muted rounded-lg border border-destructive/30 p-3"
                    >
                      <span className="text-sm text-destructive">
                        {preview.skill.name}: {preview.error}
                      </span>
                    </div>
                  );
                }

                const id = preview.config.id;
                const action = actions.get(id) ?? "skip";
                const dedup = preview.dedup;

                return (
                  <div
                    key={id}
                    className="surface-card-muted rounded-lg border border-border/60 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-medium truncate">
                          {preview.config.name}
                        </span>
                        {dedup && (
                          <Badge
                            variant={
                              dedup.status === "new"
                                ? "default"
                                : dedup.status === "near-match"
                                  ? "secondary"
                                  : "destructive"
                            }
                            className="text-[10px] px-1.5 py-0 shrink-0"
                          >
                            {dedup.status === "new" && (
                              <>
                                <Check className="h-2.5 w-2.5 mr-0.5" />
                                New
                              </>
                            )}
                            {dedup.status === "near-match" && (
                              <>
                                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                                Similar
                              </>
                            )}
                            {dedup.status === "exact-match" && "Exists"}
                          </Badge>
                        )}
                      </div>
                      <Select
                        value={action}
                        onValueChange={(v) =>
                          setActions((prev) => new Map(prev).set(id, v as ImportAction))
                        }
                      >
                        <SelectTrigger className="h-7 w-[130px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="import">Import</SelectItem>
                          <SelectItem value="replace">Replace</SelectItem>
                          <SelectItem value="copy">Import as copy</SelectItem>
                          <SelectItem value="skip">Skip</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {dedup?.matchReason && (
                      <p className="text-xs text-muted-foreground">
                        {dedup.matchReason}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1">
                      <Badge variant="outline" className="text-[10px]">
                        {preview.config.domain}
                      </Badge>
                      {preview.config.tags?.slice(0, 4).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">
                          {tag}
                        </Badge>
                      ))}
                      {preview.config.allowedTools && (
                        <Badge variant="secondary" className="text-[10px]">
                          {preview.config.allowedTools.length} tools
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Step 4: Results */}
          {step === 4 && importResult && (
            <div className="space-y-4">
              <div className="surface-card rounded-lg border border-border/60 p-4 space-y-3">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{importResult.imported}</p>
                    <p className="text-xs text-muted-foreground">Imported</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-500">{importResult.replaced}</p>
                    <p className="text-xs text-muted-foreground">Replaced</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-muted-foreground">{importResult.skipped}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </div>
                </div>

                {scanResult && (
                  <div className="flex items-center gap-2 pt-2 border-t border-border/60 text-xs text-muted-foreground">
                    <Github className="h-3.5 w-3.5" />
                    <span>
                      Imported from{" "}
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                      >
                        {scanResult.owner}/{scanResult.repo}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                      {" "}at {scanResult.commitSha.slice(0, 7)}
                    </span>
                  </div>
                )}
              </div>

              {importResult.errors && importResult.errors.length > 0 && (
                <div className="surface-card-muted rounded-lg border border-destructive/30 p-3 space-y-1">
                  <p className="text-xs font-medium text-destructive">Errors:</p>
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step > 1 && step < 4 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              disabled={loading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          )}

          <div className="flex-1" />

          {step === 1 && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleScan} disabled={loading || !url.trim()}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                Scan Repository
              </Button>
            </>
          )}

          {step === 2 && (
            <Button onClick={handlePreview} disabled={loading || selectedPaths.size === 0}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ChevronRight className="mr-2 h-4 w-4" />
              )}
              Preview ({selectedPaths.size})
            </Button>
          )}

          {step === 3 && (
            <Button onClick={handleConfirm} disabled={loading || actionCounts.import + actionCounts.replace === 0}>
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Import {actionCounts.import + actionCounts.replace} profile
              {actionCounts.import + actionCounts.replace !== 1 ? "s" : ""}
              {actionCounts.skip > 0 && ` (${actionCounts.skip} skipped)`}
            </Button>
          )}

          {step === 4 && (
            <Button
              onClick={() => {
                reset();
                onOpenChange(false);
                onImported();
              }}
            >
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
