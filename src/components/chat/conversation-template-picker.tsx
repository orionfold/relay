"use client";

/**
 * Conversation Template Picker — sliding sheet that lists workflow blueprints
 * and, on selection, creates a new conversation pre-filled with the blueprint's
 * rendered `chatPrompt` (falling back to step 1's `promptTemplate`).
 *
 * Transport: writes the rendered prompt into `sessionStorage` under
 * `chat:prefill:<conversationId>` before navigating. The chat composer reads
 * and removes it on mount. This keeps the conversation schema unchanged (no
 * `drafts` column) and survives the client-side navigation without flicker.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input as TextInput } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Sparkles } from "lucide-react";
import type {
  WorkflowBlueprint,
  BlueprintVariable,
} from "@/lib/workflows/blueprints/types";
import { renderBlueprintPrompt } from "@/lib/workflows/blueprints/render-prompt";
import { useChatSession } from "./chat-session-provider";

export const PREFILL_STORAGE_PREFIX = "chat:prefill:";
export const PREFILL_PENDING_KEY = "chat:prefill:pending";

export function prefillKey(conversationId: string): string {
  return `${PREFILL_STORAGE_PREFIX}${conversationId}`;
}

interface ConversationTemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConversationTemplatePicker({
  open,
  onOpenChange,
}: ConversationTemplatePickerProps) {
  const { createConversation } = useChatSession();
  const [blueprints, setBlueprints] = useState<WorkflowBlueprint[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<WorkflowBlueprint | null>(null);
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch blueprints once the sheet is opened for the first time.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch("/api/blueprints")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: WorkflowBlueprint[]) => {
        if (!cancelled) setBlueprints(data);
      })
      .catch(() => {
        if (!cancelled) setBlueprints([]);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  // Reset transient state whenever the sheet closes.
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setParamValues({});
      setError(null);
      setCreating(false);
    }
  }, [open]);

  const canSubmit = useMemo(() => {
    if (!selected) return false;
    return selected.variables
      .filter((v) => v.required)
      .every((v) => {
        const raw = paramValues[v.id];
        if (v.type === "boolean") return raw !== undefined;
        if (v.type === "number") return typeof raw === "number" && !isNaN(raw);
        return typeof raw === "string" && raw.trim().length > 0;
      });
  }, [selected, paramValues]);

  const handleSelect = (bp: WorkflowBlueprint) => {
    // Initialize param values with blueprint defaults.
    const initial: Record<string, unknown> = {};
    for (const v of bp.variables) {
      if (v.default !== undefined) initial[v.id] = v.default;
    }
    setParamValues(initial);
    setSelected(bp);
    setError(null);

    // Zero-parameter blueprint: start immediately.
    if (bp.variables.length === 0) {
      void startConversation(bp, {});
    }
  };

  async function startConversation(
    bp: WorkflowBlueprint,
    params: Record<string, unknown>
  ) {
    setCreating(true);
    setError(null);
    try {
      const rendered = renderBlueprintPrompt(bp, params);

      // Race-order: the provider's `createConversation` both POSTs AND
      // activates the new conversation internally. That means by the time
      // `createConversation` resolves, the chat composer has already mounted
      // with the new `conversationId` and its hydration effect has already
      // fired. So we MUST write the prefill *before* awaiting, using a
      // non-id-keyed "pending" slot that the composer consumes on next
      // activation. The input clears it after reading — one-shot semantics.
      const hasPrefill = rendered.firstMessage.trim().length > 0;
      if (hasPrefill) {
        try {
          window.sessionStorage.setItem(PREFILL_PENDING_KEY, rendered.firstMessage);
        } catch {
          // sessionStorage can throw in private modes. User still lands in
          // a valid empty conversation — graceful degradation.
        }
      }

      const id = await createConversation({
        title: rendered.title || bp.name,
      });
      if (!id) {
        // Clean up pending slot on failure so a later unrelated conversation
        // doesn't accidentally consume it.
        try {
          window.sessionStorage.removeItem(PREFILL_PENDING_KEY);
        } catch {}
        throw new Error("Failed to create conversation");
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start conversation");
      setCreating(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="p-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2">
            {selected && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setSelected(null)}
                aria-label="Back to blueprint list"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Sparkles className="h-4 w-4 text-primary" />
            {selected ? selected.name : "Start from template"}
          </SheetTitle>
          <SheetDescription>
            {selected
              ? selected.description
              : "Pick a workflow blueprint. Its prompt will pre-fill the chat composer so you can edit before sending."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
          {!selected && (
            <BlueprintList
              blueprints={blueprints}
              loaded={loaded}
              onSelect={handleSelect}
            />
          )}
          {selected && (
            <ParameterForm
              blueprint={selected}
              values={paramValues}
              onChange={setParamValues}
            />
          )}
          {error && (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        {selected && (
          <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={creating}>
              Back
            </Button>
            <Button
              onClick={() => startConversation(selected, paramValues)}
              disabled={!canSubmit || creating}
            >
              {creating ? "Starting…" : "Start conversation"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Blueprint list ───────────────────────────────────────────────────────

function BlueprintList({
  blueprints,
  loaded,
  onSelect,
}: {
  blueprints: WorkflowBlueprint[];
  loaded: boolean;
  onSelect: (bp: WorkflowBlueprint) => void;
}) {
  if (!loaded) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (blueprints.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No blueprints available.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {blueprints.map((bp) => {
        const previewSource =
          bp.chatPrompt ?? bp.steps[0]?.promptTemplate ?? "";
        const preview =
          previewSource.length > 140
            ? previewSource.slice(0, 140).trim() + "…"
            : previewSource;
        return (
          <button
            key={bp.id}
            className="w-full text-left rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onSelect(bp)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{bp.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {bp.description}
                </div>
                {preview && (
                  <div className="text-xs text-muted-foreground/80 mt-2 font-mono line-clamp-2">
                    {preview}
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {bp.variables.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {bp.variables.length} param
                    {bp.variables.length > 1 ? "s" : ""}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs capitalize">
                  {bp.domain}
                </Badge>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Parameter form ───────────────────────────────────────────────────────

function ParameterForm({
  blueprint,
  values,
  onChange,
}: {
  blueprint: WorkflowBlueprint;
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const setValue = (id: string, v: unknown) => onChange({ ...values, [id]: v });

  if (blueprint.variables.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This blueprint has no parameters. Starting a conversation now.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {blueprint.variables.map((variable) => (
        <VariableInput
          key={variable.id}
          variable={variable}
          value={values[variable.id]}
          onChange={(v) => setValue(variable.id, v)}
        />
      ))}
    </div>
  );
}

function VariableInput({
  variable,
  value,
  onChange,
}: {
  variable: BlueprintVariable;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {variable.label}
        {variable.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {variable.description && (
        <p className="text-xs text-muted-foreground">{variable.description}</p>
      )}

      {variable.type === "text" && (
        <TextInput
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
        />
      )}

      {variable.type === "textarea" && (
        <Textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          placeholder={variable.placeholder}
          rows={3}
        />
      )}

      {variable.type === "number" && (
        <TextInput
          type="number"
          value={value !== undefined && value !== null ? Number(value) : ""}
          onChange={(e) =>
            onChange(e.target.value ? Number(e.target.value) : undefined)
          }
          min={variable.min}
          max={variable.max}
        />
      )}

      {variable.type === "boolean" && (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked)}
        />
      )}

      {variable.type === "select" && variable.options && (
        <Select
          value={String(value ?? "")}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {variable.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
