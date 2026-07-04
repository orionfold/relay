"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Check,
  X,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ProfileAssistResponse } from "@/lib/agents/runtime/profile-assist-types";
import type { SmokeTestDraft } from "./smoke-test-editor";

export interface ProfileAssistResult {
  name: string;
  description: string;
  domain: "work" | "personal";
  tags: string[];
  skillMd: string;
  allowedTools: string[];
  canUseToolPolicy: { autoApprove: string[]; autoDeny: string[] };
  maxTurns: number;
  outputFormat: string;
  supportedRuntimes: string[];
  tests: SmokeTestDraft[];
  reasoning: string;
}

interface ProfileAssistPanelProps {
  onApplyAll: (result: ProfileAssistResult) => void;
  onApplyField: (field: keyof ProfileAssistResult, value: unknown) => void;
  /** Current mode — enables refine/suggest-tests on edit */
  isEdit?: boolean;
  existingSkillMd?: string;
  existingTags?: string[];
}

const ACTIVITY_MESSAGES = [
  "Analyzing your goal...",
  "Designing agent capabilities...",
  "Generating SKILL.md...",
  "Creating smoke tests...",
  "Finalizing profile...",
];

const EXAMPLE_PROMPTS = [
  "Security-focused code reviewer",
  "Research agent that cites sources",
  "Technical documentation writer",
  "Personal fitness coach",
];

function ProgressBar({ loading }: { loading: boolean }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    if (!loading) {
      setMessageIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setMessageIndex((prev) =>
        prev < ACTIVITY_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 3000);
    return () => clearInterval(interval);
  }, [loading]);

  if (!loading) return null;

  return (
    <div className="space-y-1.5">
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-full w-full rounded-full bg-primary animate-[progress-slide_1.5s_ease-in-out_infinite]" />
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {ACTIVITY_MESSAGES[messageIndex]}
      </p>
    </div>
  );
}

function toAssistResult(raw: ProfileAssistResponse): ProfileAssistResult {
  return {
    name: raw.name ?? "",
    description: raw.description ?? "",
    domain: raw.domain ?? "work",
    tags: raw.tags ?? [],
    skillMd: raw.skillMd ?? "",
    allowedTools: raw.allowedTools ?? [],
    canUseToolPolicy: raw.canUseToolPolicy ?? { autoApprove: [], autoDeny: [] },
    maxTurns: raw.maxTurns ?? 30,
    outputFormat: raw.outputFormat ?? "",
    supportedRuntimes: raw.supportedRuntimes ?? ["claude-code"],
    tests: (raw.tests ?? []).map((t) => ({
      task: t.task,
      expectedKeywords: t.expectedKeywords.join(", "),
    })),
    reasoning: raw.reasoning ?? "",
  };
}

export function ProfileAssistPanel({
  onApplyAll,
  onApplyField,
  isEdit = false,
  existingSkillMd,
  existingTags,
}: ProfileAssistPanelProps) {
  const [goal, setGoal] = useState("");
  const [domain, setDomain] = useState<"work" | "personal" | "auto">("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ProfileAssistResult | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [appliedSections, setAppliedSections] = useState<Set<string>>(new Set());
  const [allApplied, setAllApplied] = useState(false);
  const [skillMdExpanded, setSkillMdExpanded] = useState(false);

  async function generate(mode: "generate" | "refine-skillmd" | "suggest-tests" = "generate") {
    if (mode === "generate" && !goal.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAppliedSections(new Set());
    setAllApplied(false);

    try {
      const res = await fetch("/api/agents/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: goal.trim() || "Improve the existing agent",
          domain: domain === "auto" ? undefined : domain,
          mode,
          existingSkillMd: mode !== "generate" ? existingSkillMd : undefined,
          existingTags: mode !== "generate" ? existingTags : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "AI assist failed");
        return;
      }

      const data = await res.json();
      setResult(toAssistResult(data));
      setExpanded(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  function applySection(section: string) {
    if (!result) return;
    setAppliedSections((prev) => new Set([...prev, section]));

    switch (section) {
      case "identity":
        onApplyField("name", result.name);
        onApplyField("description", result.description);
        onApplyField("domain", result.domain);
        onApplyField("tags", result.tags);
        break;
      case "config":
        onApplyField("maxTurns", result.maxTurns);
        onApplyField("outputFormat", result.outputFormat);
        onApplyField("allowedTools", result.allowedTools);
        onApplyField("supportedRuntimes", result.supportedRuntimes);
        break;
      case "policy":
        onApplyField("canUseToolPolicy", result.canUseToolPolicy);
        break;
      case "skillmd":
        onApplyField("skillMd", result.skillMd);
        break;
      case "tests":
        onApplyField("tests", result.tests);
        break;
    }
  }

  function handleApplyAll() {
    if (!result) return;
    onApplyAll(result);
    setAllApplied(true);
    setAppliedSections(new Set(["identity", "config", "policy", "skillmd", "tests"]));
  }

  return (
    <div className="surface-card-muted rounded-lg border border-primary/20 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">AI Assist</span>
        {!result && (
          <span className="text-xs text-muted-foreground">
            Describe your agent and AI will generate the full profile
          </span>
        )}
        {result && allApplied && (
          <Badge variant="default" className="text-xs">
            <Check className="h-3 w-3 mr-0.5" /> Applied
          </Badge>
        )}
      </div>

      {/* Goal input — always visible so user can edit & regenerate */}
      <Textarea
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder="I want an agent that..."
        rows={2}
        className="text-sm"
      />

      {/* Example prompts for first-time users */}
      {!goal && !isEdit && !result && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
              onClick={() => setGoal(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Select
          value={domain}
          onValueChange={(v) => setDomain(v as "work" | "personal" | "auto")}
        >
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">Auto-detect</SelectItem>
            <SelectItem value="work">Work</SelectItem>
            <SelectItem value="personal">Personal</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          size="sm"
          onClick={() => generate("generate")}
          disabled={loading || !goal.trim()}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          {result ? "Regenerate" : "Generate Agent"}
        </Button>

        {isEdit && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => generate("refine-skillmd")}
              disabled={loading}
            >
              Refine SKILL.md
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => generate("suggest-tests")}
              disabled={loading}
            >
              Suggest Tests
            </Button>
          </>
        )}
      </div>

      <ProgressBar loading={loading} />
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Results — collapsible */}
      {result && (
        <>
          <div className="flex items-center justify-between border-t border-border/40 pt-3">
            <span className="text-xs font-medium text-muted-foreground">Generated Agent</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </Button>
          </div>

          {expanded && (
            <div className="space-y-3">
              {/* Reasoning */}
              {result.reasoning && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                  <div className="flex gap-2">
                    <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <p className="text-xs text-muted-foreground">{result.reasoning}</p>
                  </div>
                </div>
              )}

              {/* Two-column layout for compact result sections */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {/* Identity section */}
                <SectionCard
                  title="Identity"
                  applied={appliedSections.has("identity")}
                  onApply={() => applySection("identity")}
                >
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Name:</span> {result.name}</p>
                    <p><span className="text-muted-foreground">Domain:</span> {result.domain}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-muted-foreground">Tags:</span>
                      {result.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                </SectionCard>

                {/* Configuration section */}
                <SectionCard
                  title="Configuration"
                  applied={appliedSections.has("config")}
                  onApply={() => applySection("config")}
                >
                  <div className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Max Turns:</span> {result.maxTurns}</p>
                    <p><span className="text-muted-foreground">Output:</span> {result.outputFormat || "default"}</p>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-muted-foreground">Tools:</span>
                      {result.allowedTools.length > 0 ? (
                        result.allowedTools.map((tool) => (
                          <Badge key={tool} variant="outline" className="text-xs">{tool}</Badge>
                        ))
                      ) : (
                        <span className="text-xs italic">unrestricted</span>
                      )}
                    </div>
                  </div>
                </SectionCard>

                {/* Policy section — only show if AI suggested non-empty policies */}
                {(result.canUseToolPolicy.autoApprove.length > 0 ||
                  result.canUseToolPolicy.autoDeny.length > 0) && (
                  <SectionCard
                    title="Tool Policies"
                    applied={appliedSections.has("policy")}
                    onApply={() => applySection("policy")}
                  >
                    <div className="text-sm space-y-1">
                      {result.canUseToolPolicy.autoApprove.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-muted-foreground">Auto-approve:</span>
                          {result.canUseToolPolicy.autoApprove.map((tool) => (
                            <Badge key={tool} variant="outline" className="text-xs text-green-600">{tool}</Badge>
                          ))}
                        </div>
                      )}
                      {result.canUseToolPolicy.autoDeny.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-muted-foreground">Auto-deny:</span>
                          {result.canUseToolPolicy.autoDeny.map((tool) => (
                            <Badge key={tool} variant="outline" className="text-xs text-red-600">{tool}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </SectionCard>
                )}
              </div>

              {/* SKILL.md section — full width */}
              <SectionCard
                title="SKILL.md"
                applied={appliedSections.has("skillmd")}
                onApply={() => applySection("skillmd")}
              >
                <div>
                  <button
                    type="button"
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSkillMdExpanded(!skillMdExpanded)}
                  >
                    {skillMdExpanded ? "Collapse" : "Preview"} ({result.skillMd.split("\n").length} lines)
                  </button>
                  {skillMdExpanded && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap">
                      {result.skillMd}
                    </pre>
                  )}
                </div>
              </SectionCard>

              {/* Tests section — full width */}
              {result.tests.length > 0 && (
                <SectionCard
                  title={`Smoke Tests (${result.tests.length})`}
                  applied={appliedSections.has("tests")}
                  onApply={() => applySection("tests")}
                >
                  <div className="space-y-1.5">
                    {result.tests.map((test, i) => (
                      <div key={i} className="text-xs">
                        <p className="font-medium">{i + 1}. {test.task}</p>
                        <p className="text-muted-foreground ml-3">
                          Keywords: {test.expectedKeywords}
                        </p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyAll}
                  disabled={allApplied}
                >
                  {allApplied ? (
                    <><Check className="h-3 w-3 mr-1" /> All Applied</>
                  ) : (
                    <><Sparkles className="h-3 w-3 mr-1" /> Apply All</>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setResult(null)}
                  className="text-muted-foreground"
                >
                  <X className="h-3 w-3 mr-1" /> Dismiss
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Small card for each result section with Apply button */
function SectionCard({
  title,
  applied,
  onApply,
  children,
}: {
  title: string;
  applied: boolean;
  onApply: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={onApply}
          disabled={applied}
        >
          {applied ? (
            <><Check className="h-3 w-3 mr-1" /> Applied</>
          ) : (
            "Apply"
          )}
        </Button>
      </div>
      {children}
    </div>
  );
}
