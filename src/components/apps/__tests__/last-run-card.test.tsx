import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LastRunCard, RunnableBlueprintCard } from "../last-run-card";
import type { BlueprintCard } from "@/lib/apps/view-kits/types";

function makeCard(overrides: Partial<BlueprintCard> = {}): BlueprintCard {
  return {
    id: "bp-1",
    name: "New-Business Machine",
    description: "Research a prospect, then draft a proposal.",
    variables: [],
    trigger: null,
    isPrimary: false,
    resolved: true,
    ...overrides,
  };
}

describe("LastRunCard", () => {
  it("renders blueprint label and 'never run' when lastRun is null", () => {
    render(
      <LastRunCard
        blueprintId="bp-1"
        blueprintLabel="Weekly review"
        lastRun={null}
        runCount30d={0}
      />
    );
    expect(screen.getByText(/Weekly review/i)).toBeInTheDocument();
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
  });

  it("renders status badge and relative time when lastRun is present", () => {
    render(
      <LastRunCard
        blueprintId="bp-1"
        blueprintLabel="Weekly review"
        lastRun={{
          id: "t-1",
          status: "completed",
          createdAt: Date.now() - 2 * 3_600_000,
        }}
        runCount30d={5}
      />
    );
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
    expect(screen.getByText(/5 runs/)).toBeInTheDocument();
  });

  it("renders failed-status with destructive intent", () => {
    render(
      <LastRunCard
        blueprintId="bp-1"
        blueprintLabel="Sync"
        lastRun={{
          id: "t-1",
          status: "failed",
          createdAt: Date.now() - 60_000,
        }}
        runCount30d={2}
      />
    );
    expect(screen.getByText(/failed/i)).toBeInTheDocument();
  });
});

describe("RunnableBlueprintCard (FEAT-5/6)", () => {
  it("renders the blueprint name, description, and a Run action", () => {
    render(
      <RunnableBlueprintCard card={makeCard()} lastRun={null} runCount30d={0} />
    );
    expect(screen.getByText(/New-Business Machine/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Research a prospect, then draft a proposal/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run/i })).toBeInTheDocument();
    expect(screen.getByText(/never run/i)).toBeInTheDocument();
  });

  it("flags the primary card 'Start here'", () => {
    render(
      <RunnableBlueprintCard
        card={makeCard({ isPrimary: true })}
        lastRun={null}
        runCount30d={0}
      />
    );
    expect(screen.getByText(/start here/i)).toBeInTheDocument();
  });

  it("does not flag 'Start here' on a non-primary card", () => {
    render(
      <RunnableBlueprintCard card={makeCard()} lastRun={null} runCount30d={0} />
    );
    expect(screen.queryByText(/start here/i)).not.toBeInTheDocument();
  });

  it("labels row-insert blueprints as automatic instead of offering a manual Run", () => {
    render(
      <RunnableBlueprintCard
        card={makeCard({
          id: "intake",
          name: "Intake Pipeline",
          trigger: { kind: "row-insert", table: "tbl-uuid", tableName: "Intake" },
        })}
        lastRun={null}
        runCount30d={0}
      />
    );
    // No fighting manual Run button; a "runs on its own" note names the table
    // by its human name (not the raw UUID).
    expect(screen.queryByRole("button", { name: /^run$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/runs on its own/i)).toBeInTheDocument();
    expect(screen.getByText(/Intake table/i)).toBeInTheDocument();
  });

  it("renders an honest 'couldn't load' state (no Run) for an unresolved card (#31)", () => {
    render(
      <RunnableBlueprintCard
        card={makeCard({
          id: "relay-agency--lease-abstraction",
          name: "relay-agency--lease-abstraction",
          description: null,
          resolved: false,
        })}
        lastRun={null}
        runCount30d={0}
      />
    );
    // The raw id still shows (so the user can identify which one broke) but the
    // card offers no fake action and states the failure plainly.
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^run$/i })
    ).not.toBeInTheDocument();
  });

  it("shows last-run status + run count when a run exists", () => {
    render(
      <RunnableBlueprintCard
        card={makeCard()}
        lastRun={{ id: "t1", status: "completed", createdAt: Date.now() }}
        runCount30d={3}
      />
    );
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
    expect(screen.getByText(/3 runs/)).toBeInTheDocument();
  });
});

describe("LastRunCard variant=hero", () => {
  const baseTask = {
    id: "t1",
    title: "Weekly digest",
    status: "completed" as const,
    createdAt: Date.now(),
    result:
      "## Portfolio Summary\n\n- Allocation: 60% stocks, 40% bonds\n\n```\nNVDA: +12%\n```",
  };

  it("renders the result as full markdown (with code fence)", () => {
    render(<LastRunCard variant="hero" task={baseTask} previousRuns={[]} />);
    expect(screen.getByText(/portfolio summary/i)).toBeInTheDocument();
    expect(screen.getByText(/NVDA: \+12%/i)).toBeInTheDocument();
  });

  it("renders metadata footer (status badge)", () => {
    render(<LastRunCard variant="hero" task={baseTask} previousRuns={[]} />);
    expect(screen.getByText(/completed/i)).toBeInTheDocument();
  });

  it("renders 'Previous runs' disclosure when previousRuns is non-empty", () => {
    const previousRuns = [
      {
        id: "p1",
        title: "Last week",
        status: "completed" as const,
        createdAt: Date.now() - 86_400_000,
        result: "old",
      },
    ];
    render(
      <LastRunCard variant="hero" task={baseTask} previousRuns={previousRuns} />
    );
    expect(
      screen.getByRole("button", { name: /previous runs/i })
    ).toBeInTheDocument();
  });

  it("renders empty-state when task is null", () => {
    render(<LastRunCard variant="hero" task={null} previousRuns={[]} />);
    expect(screen.getByText(/no digest yet/i)).toBeInTheDocument();
  });

  it("renders failed-task rescue when task.status='failed'", () => {
    const failedTask = {
      ...baseTask,
      status: "failed" as const,
      result: "Error: API limit",
    };
    render(<LastRunCard variant="hero" task={failedTask} previousRuns={[]} />);
    expect(screen.getByText(/last run failed/i)).toBeInTheDocument();
  });

  it("compact variant unchanged (existing shape still works)", () => {
    render(
      <LastRunCard
        blueprintId="bp-1"
        blueprintLabel="Weekly review"
        lastRun={{ id: "t1", status: "completed", createdAt: Date.now() }}
        runCount30d={5}
      />
    );
    expect(screen.getByText(/weekly review/i)).toBeInTheDocument();
  });
});
