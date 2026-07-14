"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  SuccessCriteria,
  SuccessCriterion,
} from "@/lib/operations/criteria";
import { randomId } from "@/lib/utils/uuid";

interface SuccessCriteriaBuilderProps {
  value: SuccessCriteria;
  onChange: (value: SuccessCriteria) => void;
}

type Check = SuccessCriterion["check"];

const CHECK_LABELS: Record<Check, string> = {
  status_is: "Run status is completed",
  result_contains: "Result contains text",
  output_count_at_least: "Output count is at least",
  duration_at_most_seconds: "Duration is at most",
};

function defaultCriterion(): SuccessCriterion {
  const suffix = randomId().slice(0, 8).toLowerCase();
  return {
    id: `criterion-${suffix}`,
    label: "Run completed",
    level: "required",
    check: "status_is",
    value: "completed",
  };
}

function criterionForCheck(
  current: SuccessCriterion,
  check: Check
): SuccessCriterion {
  const base = {
    id: current.id,
    label: current.label,
    level: current.level,
  };
  switch (check) {
    case "status_is":
      return { ...base, check, value: "completed" };
    case "result_contains":
      return { ...base, check, value: "" };
    case "output_count_at_least":
      return { ...base, check, value: 1 };
    case "duration_at_most_seconds":
      return { ...base, check, value: 600 };
  }
}

export function SuccessCriteriaBuilder({
  value,
  onChange,
}: SuccessCriteriaBuilderProps) {
  function update(index: number, criterion: SuccessCriterion) {
    onChange(value.map((item, itemIndex) =>
      itemIndex === index ? criterion : item
    ));
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Success criteria</p>
        <p className="text-xs text-muted-foreground">
          Required misses fail the receipt. Advisory misses mark it At risk.
        </p>
      </div>

      {value.length === 0 ? (
        <div className="surface-card-muted rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          No success bar yet. Completed runs will be marked At risk until one is configured.
        </div>
      ) : (
        <div className="space-y-2">
          {value.map((criterion, index) => (
            <div
              key={criterion.id}
              className="surface-card-muted space-y-2 rounded-lg border p-3"
            >
              <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto]">
                <Select
                  value={criterion.level}
                  onValueChange={(level) =>
                    update(index, {
                      ...criterion,
                      level: level as SuccessCriterion["level"],
                    })
                  }
                >
                  <SelectTrigger aria-label={`Level for ${criterion.label}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="advisory">Advisory</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={criterion.label}
                  maxLength={120}
                  aria-label={`Label for criterion ${index + 1}`}
                  onChange={(event) =>
                    update(index, { ...criterion, label: event.target.value })
                  }
                  placeholder="What should this prove?"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${criterion.label || `criterion ${index + 1}`}`}
                  onClick={() =>
                    onChange(value.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Check</Label>
                  <Select
                    value={criterion.check}
                    onValueChange={(check) =>
                      update(index, criterionForCheck(criterion, check as Check))
                    }
                  >
                    <SelectTrigger aria-label={`Check for ${criterion.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CHECK_LABELS).map(([check, label]) => (
                        <SelectItem key={check} value={check}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Value</Label>
                  {criterion.check === "status_is" ? (
                    <Input value="completed" disabled aria-label="Expected status" />
                  ) : criterion.check === "result_contains" ? (
                    <Input
                      value={criterion.value}
                      maxLength={200}
                      aria-label={`Expected result text for ${criterion.label}`}
                      onChange={(event) =>
                        update(index, { ...criterion, value: event.target.value })
                      }
                      placeholder="Required phrase"
                    />
                  ) : (
                    <Input
                      type="number"
                      min={criterion.check === "output_count_at_least" ? 0 : 1}
                      max={
                        criterion.check === "output_count_at_least"
                          ? 10_000
                          : 604_800
                      }
                      value={criterion.value}
                      aria-label={`Expected numeric value for ${criterion.label}`}
                      onChange={(event) =>
                        update(index, {
                          ...criterion,
                          value: Number(event.target.value),
                        })
                      }
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={value.length >= 8}
        onClick={() => onChange([...value, defaultCriterion()])}
      >
        <Plus className="h-4 w-4" />
        Add criterion
      </Button>
    </div>
  );
}
