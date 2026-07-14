"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Send } from "lucide-react";
import { toast } from "sonner";
import {
  announceApprovalResolved,
  isAlreadyResolvedApproval,
  readApprovalResponse,
  runApprovalMutation,
} from "@/lib/notifications/approval-client";

export interface Question {
  id?: string;
  question: string;
  header: string;
  options?: { label: string; description: string }[];
  multiSelect?: boolean;
  isSecret?: boolean;
}

interface MessageResponseProps {
  taskId: string;
  notificationId: string;
  toolInput: { questions: Question[] };
  responded: boolean;
  response: string | null;
  onResponded: () => void;
}

export function MessageResponse({
  taskId,
  notificationId,
  toolInput,
  responded,
  response,
  onResponded,
}: MessageResponseProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (responded && response) {
    return (
      <span className="text-xs text-muted-foreground">Response sent</span>
    );
  }

  const questions = toolInput?.questions ?? [];

  function getAnswerKey(question: Question) {
    return question.id ?? question.question;
  }

  function handleSingleSelect(questionKey: string, label: string) {
    setAnswers((prev) => ({ ...prev, [questionKey]: label }));
  }

  function handleMultiSelect(
    questionKey: string,
    label: string,
    checked: boolean
  ) {
    setAnswers((prev) => {
      const current = prev[questionKey] ? prev[questionKey].split(", ") : [];
      const next = checked
        ? [...current, label]
        : current.filter((l) => l !== label);
      return { ...prev, [questionKey]: next.join(", ") };
    });
  }

  async function handleSend() {
    setLoading(true);
    setErrorMessage(null);
    // Merge in "Other" text where applicable
    const finalAnswers: Record<string, string> = {};
    for (const q of questions) {
      const questionKey = getAnswerKey(q);
      const answer = answers[questionKey] ?? "";
      if (answer === "__other__") {
        finalAnswers[questionKey] = otherTexts[questionKey] ?? "";
      } else {
        finalAnswers[questionKey] = answer;
      }
    }

    try {
      await runApprovalMutation(notificationId, async () => {
        const response = await fetch(`/api/tasks/${taskId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notificationId,
            behavior: "allow",
            updatedInput: {
              questions: toolInput.questions,
              answers: finalAnswers,
            },
          }),
        });
        await readApprovalResponse(
          response,
          "Failed to send answer",
          (value): value is { success: true } =>
            typeof value === "object" &&
            value !== null &&
            (value as { success?: unknown }).success === true
        );
      });
      announceApprovalResolved(notificationId);
      onResponded();
    } catch (error) {
      if (isAlreadyResolvedApproval(error)) {
        announceApprovalResolved(notificationId);
        onResponded();
        toast.info(
          error instanceof Error ? error.message : "Reply already resolved"
        );
        return;
      }
      const message =
        error instanceof Error ? error.message : "Failed to send answer";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 mt-2">
      {questions.map((q) => (
        <div key={getAnswerKey(q)} className="space-y-2">
          <p className="text-sm font-medium">{q.question}</p>
          {(q.multiSelect ?? false) ? (
            <div className="space-y-2">
              {(q.options ?? []).map((opt) => (
                <div key={opt.label} className="flex items-center gap-2">
                  <Checkbox
                    id={`${getAnswerKey(q)}-${opt.label}`}
                    onCheckedChange={(checked) =>
                      handleMultiSelect(getAnswerKey(q), opt.label, checked as boolean)
                    }
                  />
                  <Label
                    htmlFor={`${getAnswerKey(q)}-${opt.label}`}
                    className="text-sm"
                  >
                    {opt.label}
                    <span className="text-muted-foreground ml-1">
                      — {opt.description}
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          ) : (q.options ?? []).length === 0 ? (
            <Input
              type={q.isSecret ? "password" : "text"}
              value={answers[getAnswerKey(q)] ?? ""}
              onChange={(e) =>
                setAnswers((prev) => ({
                  ...prev,
                  [getAnswerKey(q)]: e.target.value,
                }))
              }
              placeholder="Type your answer"
              className="h-8 text-sm"
            />
          ) : (
            <RadioGroup
              value={answers[getAnswerKey(q)] ?? ""}
              onValueChange={(val) => handleSingleSelect(getAnswerKey(q), val)}
            >
              {(q.options ?? []).map((opt) => (
                <div key={opt.label} className="flex items-center gap-2">
                  <RadioGroupItem
                    value={opt.label}
                    id={`${getAnswerKey(q)}-${opt.label}`}
                  />
                  <Label
                    htmlFor={`${getAnswerKey(q)}-${opt.label}`}
                    className="text-sm"
                  >
                    {opt.label}
                    <span className="text-muted-foreground ml-1">
                      — {opt.description}
                    </span>
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <RadioGroupItem value="__other__" id={`${getAnswerKey(q)}-other`} />
                <Label htmlFor={`${getAnswerKey(q)}-other`} className="text-sm">
                  Other
                </Label>
                {answers[getAnswerKey(q)] === "__other__" && (
                  <Input
                    type={q.isSecret ? "password" : "text"}
                    value={otherTexts[getAnswerKey(q)] ?? ""}
                    onChange={(e) =>
                      setOtherTexts((prev) => ({
                        ...prev,
                        [getAnswerKey(q)]: e.target.value,
                      }))
                    }
                    placeholder="Type your answer"
                    className="h-7 text-sm"
                  />
                )}
              </div>
            </RadioGroup>
          )}
        </div>
      ))}
      <Button size="sm" onClick={handleSend} disabled={loading}>
        <Send className="h-3.5 w-3.5 mr-1" />
        Send
      </Button>
      {errorMessage && (
        <p role="alert" className="text-xs text-destructive">
          Reply failed: {errorMessage}
        </p>
      )}
    </div>
  );
}
