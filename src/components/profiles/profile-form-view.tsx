"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Tag,
  SlidersHorizontal,
  FileCode,
  Cpu,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import { FormSectionCard } from "@/components/shared/form-section-card";
import { TagInput } from "@/components/shared/tag-input";
import { SmokeTestEditor, type SmokeTestDraft } from "@/components/profiles/smoke-test-editor";
import { ProfileAssistPanel, type ProfileAssistResult } from "@/components/profiles/profile-assist-panel";
import { listRuntimeCatalog } from "@/lib/agents/runtime/catalog";
import { useTagSuggestions } from "@/hooks/use-tag-suggestions";
import { KNOWN_TOOLS } from "@/lib/constants/known-tools";
import type { AgentProfile } from "@/lib/agents/profiles/types";

interface ProfileFormViewProps {
  profileId?: string;
  duplicate?: boolean;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCommaSeparated(value: string): string[] {
  return value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ProfileFormView({
  profileId,
  duplicate = false,
}: ProfileFormViewProps) {
  const runtimeOptions = listRuntimeCatalog();
  const router = useRouter();
  const { suggestions: tagSuggestions } = useTagSuggestions();
  const toolSuggestions = [...KNOWN_TOOLS] as string[];
  const isEdit = !!profileId && !duplicate;

  const [fetching, setFetching] = useState(!!profileId);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [id, setId] = useState("");
  const [domain, setDomain] = useState<"work" | "personal">("work");
  const [version, setVersion] = useState("1.0.0");
  const [author, setAuthor] = useState("");
  const [tags, setTags] = useState("");
  const [skillMd, setSkillMd] = useState("");
  const [supportedRuntimes, setSupportedRuntimes] = useState<string[]>([
    "claude-code",
  ]);
  const [codexInstructions, setCodexInstructions] = useState("");
  const [allowedTools, setAllowedTools] = useState("");
  const [autoApprove, setAutoApprove] = useState("");
  const [autoDeny, setAutoDeny] = useState("");
  const [maxTurns, setMaxTurns] = useState(30);
  const [outputFormat, setOutputFormat] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [originalVersion, setOriginalVersion] = useState<string | null>(null);
  const [tests, setTests] = useState<SmokeTestDraft[]>([]);

  // Fetch existing profile for edit/duplicate
  useEffect(() => {
    if (!profileId) return;

    fetch(`/api/agents/${profileId}`)
      .then((r) => r.json())
      .then((profile: AgentProfile) => {
        setName(duplicate ? `${profile.name} (Copy)` : profile.name);
        setDescription(profile.description ?? "");
        setId(duplicate ? `${profile.id}-copy` : profile.id);
        setDomain(profile.domain as "work" | "personal");

        // Auto-increment patch version on edit
        const ver = profile.version ?? "1.0.0";
        if (isEdit) {
          setOriginalVersion(ver);
          const parts = ver.split(".").map(Number);
          if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
            setVersion(`${parts[0]}.${parts[1]}.${parts[2] + 1}`);
          } else {
            setVersion(ver);
          }
        } else {
          setVersion(duplicate ? "1.0.0" : ver);
        }

        setAuthor(profile.author ?? "");
        setTags(profile.tags.join(", "));
        setSkillMd(profile.skillMd ?? "");
        setSupportedRuntimes(profile.supportedRuntimes ?? ["claude-code"]);
        setCodexInstructions(
          profile.runtimeOverrides?.["openai-codex-app-server"]?.instructions ?? ""
        );
        setAllowedTools(profile.allowedTools?.join(", ") ?? "");
        setAutoApprove(profile.canUseToolPolicy?.autoApprove?.join(", ") ?? "");
        setAutoDeny(profile.canUseToolPolicy?.autoDeny?.join(", ") ?? "");
        setMaxTurns(profile.maxTurns ?? 30);
        setOutputFormat(profile.outputFormat ?? "");
        if (profile.tests?.length) {
          setTests(
            profile.tests.map((t: { task: string; expectedKeywords: string[] }) => ({
              task: t.task,
              expectedKeywords: t.expectedKeywords.join(", "),
            }))
          );
        }
      })
      .catch(() => {
        toast.error("Failed to load agent");
      })
      .finally(() => setFetching(false));
  }, [profileId, duplicate, isEdit]);

  // Default author to system username for new profiles
  useEffect(() => {
    if (profileId || author) return;
    fetch("/api/settings/author-default")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.author) setAuthor(data.author);
      })
      .catch(() => {});
  }, [profileId, author]);

  // Auto-slug from name (only for create/duplicate)
  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!isEdit) {
        setId(toSlug(value));
      }
    },
    [isEdit]
  );

  // AI Assist handlers
  const handleAssistApplyAll = useCallback((result: ProfileAssistResult) => {
    handleNameChange(result.name);
    setDescription(result.description);
    setDomain(result.domain);
    setTags(result.tags.join(", "));
    setSkillMd(result.skillMd);
    setAllowedTools(result.allowedTools.join(", "));
    setAutoApprove(result.canUseToolPolicy.autoApprove.join(", "));
    setAutoDeny(result.canUseToolPolicy.autoDeny.join(", "));
    setMaxTurns(result.maxTurns);
    setOutputFormat(result.outputFormat);
    setSupportedRuntimes(result.supportedRuntimes);
    setTests(result.tests);
  }, [handleNameChange]);

  const handleAssistApplyField = useCallback((field: keyof ProfileAssistResult, value: unknown) => {
    switch (field) {
      case "name": handleNameChange(value as string); break;
      case "description": setDescription(value as string); break;
      case "domain": setDomain(value as "work" | "personal"); break;
      case "tags": setTags((value as string[]).join(", ")); break;
      case "skillMd": setSkillMd(value as string); break;
      case "allowedTools": setAllowedTools((value as string[]).join(", ")); break;
      case "canUseToolPolicy": {
        const policy = value as { autoApprove: string[]; autoDeny: string[] };
        setAutoApprove(policy.autoApprove.join(", "));
        setAutoDeny(policy.autoDeny.join(", "));
        break;
      }
      case "maxTurns": setMaxTurns(value as number); break;
      case "outputFormat": setOutputFormat(value as string); break;
      case "supportedRuntimes": setSupportedRuntimes(value as string[]); break;
      case "tests": setTests(value as SmokeTestDraft[]); break;
    }
  }, [handleNameChange]);

  const handleSubmit = async () => {
    if (!name.trim() || !id.trim()) {
      toast.error("Name and ID are required");
      return;
    }
    if (supportedRuntimes.length === 0) {
      toast.error("Select at least one supported runtime");
      return;
    }

    setSubmitting(true);

    const payload = {
      id,
      name: name.trim(),
      description: description.trim() || name.trim(),
      domain,
      version: version.trim() || "1.0.0",
      author: author.trim() || undefined,
      tags: parseCommaSeparated(tags),
      skillMd: skillMd.trim(),
      supportedRuntimes,
      runtimeOverrides: supportedRuntimes.includes("openai-codex-app-server") &&
        codexInstructions.trim()
          ? {
              "openai-codex-app-server": {
                instructions: codexInstructions.trim(),
              },
            }
          : undefined,
      allowedTools: parseCommaSeparated(allowedTools),
      canUseToolPolicy:
        autoApprove.trim() || autoDeny.trim()
          ? {
              autoApprove: parseCommaSeparated(autoApprove),
              autoDeny: parseCommaSeparated(autoDeny),
            }
          : undefined,
      maxTurns,
      outputFormat: outputFormat.trim() || undefined,
      tests: tests
        .filter((t) => t.task.trim())
        .map((t) => ({
          task: t.task.trim(),
          expectedKeywords: t.expectedKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        })),
    };

    try {
      const url = isEdit ? `/api/agents/${profileId}` : "/api/agents";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save agent");
      }

      toast.success(isEdit ? "Agent updated" : "Agent created");

      if (isEdit) {
        router.push(`/agents/${profileId}`);
      } else {
        router.push(`/agents/${id}`);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save agent"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (fetching) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
        <Skeleton className="h-64 rounded-lg md:col-span-2" />
      </div>
    );
  }

  const title = isEdit
    ? "Edit Agent"
    : duplicate
      ? "Duplicate Agent"
      : "Create Agent";

  const lineCount = skillMd.split("\n").length;

  function toggleRuntime(runtimeId: string, checked: boolean) {
    setSupportedRuntimes((current) => {
      if (checked) {
        return current.includes(runtimeId) ? current : [...current, runtimeId];
      }

      return current.filter((candidate) => candidate !== runtimeId);
    });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>

      {/* AI Assist Panel */}
      <ProfileAssistPanel
        onApplyAll={handleAssistApplyAll}
        onApplyField={handleAssistApplyField}
        isEdit={isEdit}
        existingSkillMd={skillMd}
        existingTags={parseCommaSeparated(tags)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Row 1: Identity + Metadata — two tall, dense cards side by side */}
        <FormSectionCard icon={User} title="Identity">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="My Custom Agent"
              />
              <p className="text-xs text-muted-foreground">Display name shown in the agent selector and task assignment dropdowns.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-id">ID</Label>
              <Input
                id="profile-id"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="my-custom-agent"
                disabled={isEdit}
              />
              <p className="text-xs text-muted-foreground">Unique slug used in filenames and API references. Auto-generated from name.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-domain">Domain</Label>
              <Select
                value={domain}
                onValueChange={(v) => setDomain(v as "work" | "personal")}
              >
                <SelectTrigger id="profile-domain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Work profiles enforce stricter tool approvals. Personal profiles are more permissive.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-description">Description</Label>
              <Textarea
                id="profile-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="One-line description of what this agent does"
                rows={2}
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground">Shown in profile cards and search results. Helps users understand the agent&apos;s purpose at a glance.</p>
            </div>
          </div>
        </FormSectionCard>

        <FormSectionCard icon={Tag} title="Metadata">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-version">Version</Label>
              <Input
                id="profile-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
              <p className="text-xs text-muted-foreground">
                Bump when you change SKILL.md or configuration. Used for import comparison.
                {isEdit && originalVersion && version !== originalVersion && (
                  <span className="text-primary ml-1">(bumped from {originalVersion})</span>
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-author">Author</Label>
              <Input
                id="profile-author"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Optional"
              />
              <p className="text-xs text-muted-foreground">Displayed in profile cards and exported metadata. Defaults to your system username.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-tags">Tags</Label>
              <TagInput
                id="profile-tags"
                value={tags}
                onChange={setTags}
                suggestions={tagSuggestions}
                placeholder="coding, review, analysis"
              />
              <p className="text-xs text-muted-foreground">Used for search and filtering. Also matched when AI recommends profiles for tasks.</p>
            </div>
          </div>
        </FormSectionCard>

        {/* Row 2: Compact cards — Model Tuning + Tools + Runtime in a 2-col layout */}
        <FormSectionCard icon={SlidersHorizontal} title="Model Tuning & Tools">
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="profile-turns">Max Turns</Label>
                <Badge variant="secondary" className="tabular-nums text-xs">
                  {maxTurns}
                </Badge>
              </div>
              <Slider
                id="profile-turns"
                min={1}
                max={100}
                step={1}
                value={[maxTurns]}
                onValueChange={([v]) => setMaxTurns(v)}
              />
              <p className="text-xs text-muted-foreground">Each turn = one AI response + tool call. Low (5–10) for quick answers, high (30–60) for complex work.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-format">Output Format</Label>
              <Input
                id="profile-format"
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                placeholder="e.g., markdown, json"
              />
              <p className="text-xs text-muted-foreground">Hint injected into agent context (e.g. &quot;markdown&quot;, &quot;json&quot;, &quot;structured-findings&quot;).</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-tools">Allowed Tools</Label>
              <TagInput
                id="profile-tools"
                value={allowedTools}
                onChange={setAllowedTools}
                suggestions={toolSuggestions}
                placeholder="Read, Edit, Bash, Grep"
              />
              <p className="text-xs text-muted-foreground">Restricts which tools the agent can call. Leave empty for unrestricted access.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-auto-approve">Auto-Approve Tools</Label>
              <TagInput
                id="profile-auto-approve"
                value={autoApprove}
                onChange={setAutoApprove}
                suggestions={toolSuggestions}
                placeholder="Read, Grep, Glob"
              />
              <p className="text-xs text-muted-foreground">Tools safe to run without user confirmation. Typical: Read, Grep, Glob for read-only agents.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-auto-deny">Auto-Deny Tools</Label>
              <TagInput
                id="profile-auto-deny"
                value={autoDeny}
                onChange={setAutoDeny}
                suggestions={toolSuggestions}
                placeholder="Bash, Write, Edit"
              />
              <p className="text-xs text-muted-foreground">Tools blocked entirely. Use for strict agents that should never write files or run commands.</p>
            </div>
          </div>
        </FormSectionCard>

        <FormSectionCard icon={Cpu} title="Runtime & Tests">
          <div className="space-y-4">
            {/* Runtime toggles */}
            <div className="space-y-2">
              {runtimeOptions.map((runtime) => (
                <div
                  key={runtime.id}
                  className="surface-card-muted flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{runtime.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {runtime.id === "claude-code"
                        ? "Shared SKILL.md instructions apply here by default"
                        : "Enable when this profile should be selectable on Codex"}
                    </p>
                  </div>
                  <Switch
                    checked={supportedRuntimes.includes(runtime.id)}
                    onCheckedChange={(checked) => toggleRuntime(runtime.id, checked)}
                  />
                </div>
              ))}
            </div>
            {/* Smoke tests inline */}
            <div className="border-t border-border/40 pt-3">
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Smoke Tests</span>
              </div>
              <SmokeTestEditor
                tests={tests}
                onChange={setTests}
                keywordSuggestions={parseCommaSeparated(tags)}
              />
            </div>
          </div>
        </FormSectionCard>

        {/* Codex Override — only when codex runtime selected */}
        {supportedRuntimes.includes("openai-codex-app-server") && (
          <FormSectionCard
            icon={Cpu}
            title="Codex Override"
            className="md:col-span-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="profile-codex-instructions">
                OpenAI Codex Instructions
              </Label>
              <Textarea
                id="profile-codex-instructions"
                value={codexInstructions}
                onChange={(e) => setCodexInstructions(e.target.value)}
                placeholder="Optional runtime-specific override. Leave empty to reuse SKILL.md."
                rows={6}
              />
              <p className="text-xs text-muted-foreground">
                Optional provider-specific instructions for Codex. Shared tools and policies still apply unless overridden in profile metadata.
              </p>
            </div>
          </FormSectionCard>
        )}

        {/* SKILL.md — full width, the biggest card */}
        <FormSectionCard
          icon={FileCode}
          title="SKILL.md"
          className="md:col-span-2"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="profile-skillmd">Instructions</Label>
              <Badge variant="secondary" className="text-xs">
                {lineCount} {lineCount === 1 ? "line" : "lines"}
              </Badge>
            </div>
            <Textarea
              id="profile-skillmd"
              value={skillMd}
              onChange={(e) => setSkillMd(e.target.value)}
              placeholder="Behavioral instructions for the agent..."
              className="font-mono"
              rows={14}
            />
            <p className="text-xs text-muted-foreground">Behavioral instructions injected as the agent&apos;s system prompt. Start with a role statement, add guidelines, define output format.</p>
          </div>
        </FormSectionCard>

        {/* Actions */}
        <div className="col-span-full flex items-center gap-3 pt-2">
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? "Saving..."
              : isEdit
                ? "Update Agent"
                : "Create Agent"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
