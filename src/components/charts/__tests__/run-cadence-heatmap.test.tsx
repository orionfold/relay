import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RunCadenceHeatmap } from "../run-cadence-heatmap";

describe("RunCadenceHeatmap", () => {
  it("renders 12 weeks × 7 days = 84 cells by default", () => {
    const cells = Array.from({ length: 84 }, (_, i) => ({
      date: `2026-04-${String((i % 28) + 1).padStart(2, "0")}`,
      runs: i % 3,
    }));
    const { container } = render(<RunCadenceHeatmap cells={cells} />);
    expect(container.querySelectorAll('[data-heatmap-cell]')).toHaveLength(84);
  });

  it("renders muted cells when cells array is empty", () => {
    const { container } = render(<RunCadenceHeatmap cells={[]} />);
    const allCells = container.querySelectorAll('[data-heatmap-cell]');
    expect(allCells.length).toBe(84);
    allCells.forEach((c) => expect(c.getAttribute("data-runs")).toBe("0"));
  });

  it("marks failed runs with status=fail", () => {
    // The heatmap only renders the trailing 12-week window from today, so the
    // fixture date must be inside that window (yesterday) rather than a fixed
    // calendar date that eventually ages out of view.
    const yesterday = new Date();
    yesterday.setHours(0, 0, 0, 0);
    yesterday.setDate(yesterday.getDate() - 1);
    const key = yesterday.toISOString().slice(0, 10);
    const cells = [{ date: key, runs: 1, status: "fail" as const }];
    const { container } = render(<RunCadenceHeatmap cells={cells} />);
    const failed = container.querySelector('[data-heatmap-cell][data-status="fail"]');
    expect(failed).toBeInTheDocument();
  });

  it("respects the weeks prop", () => {
    const { container } = render(<RunCadenceHeatmap cells={[]} weeks={4} />);
    expect(container.querySelectorAll('[data-heatmap-cell]')).toHaveLength(28);
  });
});
