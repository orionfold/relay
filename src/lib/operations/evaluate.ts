import type { SuccessCriteria, SuccessCriterion } from "./criteria";

export type OperationsVerdict = "passed" | "at_risk" | "failed";
export type CriterionEvidenceStatus = "passed" | "failed" | "missing";

export interface OperationsRunFacts {
  status: string;
  result: string | null;
  outputCount: number | null;
  durationSeconds: number | null;
}

export interface OperationsCriterionEvidence {
  criterionId: string;
  label: string;
  level: SuccessCriterion["level"];
  check: SuccessCriterion["check"];
  expected: string | number;
  actual: string | number | null;
  status: CriterionEvidenceStatus;
  detail: string;
}

export interface OperationsReceiptEvaluation {
  verdict: OperationsVerdict;
  evidence: OperationsCriterionEvidence[];
  summary: string;
  nextAction: string;
}

function evaluateCriterion(
  criterion: SuccessCriterion,
  facts: OperationsRunFacts
): OperationsCriterionEvidence {
  let actual: string | number | null;
  let passed = false;

  switch (criterion.check) {
    case "status_is":
      actual = facts.status;
      passed = actual === criterion.value;
      break;
    case "result_contains":
      if (facts.result === null || facts.result.trim() === "") {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          level: criterion.level,
          check: criterion.check,
          expected: criterion.value,
          actual: null,
          status: "missing",
          detail: "The run has no terminal result text to evaluate.",
        };
      }
      passed = facts.result.toLocaleLowerCase().includes(
        criterion.value.toLocaleLowerCase()
      );
      actual = passed ? "contains_expected_text" : "missing_expected_text";
      break;
    case "output_count_at_least":
      actual = facts.outputCount;
      if (actual === null) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          level: criterion.level,
          check: criterion.check,
          expected: criterion.value,
          actual: null,
          status: "missing",
          detail: "The output-document count is unavailable.",
        };
      }
      passed = actual >= criterion.value;
      break;
    case "duration_at_most_seconds":
      actual = facts.durationSeconds;
      if (actual === null) {
        return {
          criterionId: criterion.id,
          label: criterion.label,
          level: criterion.level,
          check: criterion.check,
          expected: criterion.value,
          actual: null,
          status: "missing",
          detail: "The run duration is unavailable.",
        };
      }
      passed = actual <= criterion.value;
      break;
  }

  return {
    criterionId: criterion.id,
    label: criterion.label,
    level: criterion.level,
    check: criterion.check,
    expected: criterion.value,
    actual,
    status: passed ? "passed" : "failed",
    detail: passed
      ? `${criterion.label} met its declared bar.`
      : `${criterion.label} did not meet its declared bar.`,
  };
}

export function evaluateOperationsReceipt(
  criteria: SuccessCriteria,
  facts: OperationsRunFacts
): OperationsReceiptEvaluation {
  const evidence = criteria.map((criterion) =>
    evaluateCriterion(criterion, facts)
  );

  if (facts.status !== "completed") {
    return {
      verdict: "failed",
      evidence,
      summary: `Run ended with status ${facts.status}.`,
      nextAction: "Open run diagnostics and resolve the terminal failure.",
    };
  }

  if (criteria.length === 0) {
    return {
      verdict: "at_risk",
      evidence,
      summary: "Run completed, but no success criteria were configured.",
      nextAction: "Configure success criteria before the next run.",
    };
  }

  const missing = evidence.find((item) => item.status === "missing");
  const failedRequired = evidence.find(
    (item) => item.level === "required" && item.status === "failed"
  );
  const failedAdvisory = evidence.find(
    (item) => item.level === "advisory" && item.status === "failed"
  );

  if (failedRequired) {
    return {
      verdict: "failed",
      evidence,
      summary: `Required criterion failed: ${failedRequired.label}.`,
      nextAction: `Address “${failedRequired.label}” before the next run.`,
    };
  }

  if (missing) {
    return {
      verdict: "at_risk",
      evidence,
      summary: `Evidence is missing for: ${missing.label}.`,
      nextAction: `Make “${missing.label}” observable before the next run.`,
    };
  }

  if (failedAdvisory) {
    return {
      verdict: "at_risk",
      evidence,
      summary: `Advisory criterion missed: ${failedAdvisory.label}.`,
      nextAction: `Review “${failedAdvisory.label}” before the next run.`,
    };
  }

  return {
    verdict: "passed",
    evidence,
    summary: `All ${criteria.length} success criteria passed.`,
    nextAction: "No action needed.",
  };
}
