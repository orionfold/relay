import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SuccessCriteriaBuilder } from "../success-criteria-builder";
import { OperationsReceiptHistory } from "../operations-receipt-history";

describe("SuccessCriteriaBuilder", () => {
  it("makes the missing success bar explicit and can add the closed default check", () => {
    const onChange = vi.fn();
    render(<SuccessCriteriaBuilder value={[]} onChange={onChange} />);

    expect(
      screen.getByText(/completed runs will be marked at risk/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add criterion" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        label: "Run completed",
        level: "required",
        check: "status_is",
        value: "completed",
      }),
    ]);
  });
});

describe("OperationsReceiptHistory", () => {
  it("renders the empty state without implying a pass", () => {
    render(<OperationsReceiptHistory receipts={[]} />);

    expect(screen.getByText(/no operations receipts yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
  });

  it("shows verdict, evidence, next action, and source diagnostics", () => {
    render(
      <OperationsReceiptHistory
        receipts={[
          {
            id: "receipt-1",
            ownerType: "schedule",
            workflowId: null,
            taskId: "task-1",
            workflowRunNumber: null,
            verdict: "at_risk",
            evidence: [
              {
                criterionId: "output-exists",
                label: "Output exists",
                level: "required",
                check: "output_count_at_least",
                expected: 1,
                actual: null,
                status: "missing",
                detail: "The output-document count is unavailable.",
              },
            ],
            summary: "Evidence is missing for: Output exists.",
            nextAction: "Make the output observable before the next run.",
            finishedAt: "2026-07-13T12:00:00.000Z",
          },
        ]}
        reconciliationErrors={["database busy"]}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /some receipts could not be reconciled/i
    );
    expect(screen.getByText("At risk")).toBeInTheDocument();
    expect(screen.getByText(/evidence is missing/i)).toBeInTheDocument();
    expect(screen.getByText(/make the output observable/i)).toBeInTheDocument();
    expect(screen.getByText(/output-document count is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/expected: 1 · observed: unavailable/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Open receipt source diagnostics" })
    ).toHaveAttribute("href", "/monitor?taskId=task-1");
  });
});
