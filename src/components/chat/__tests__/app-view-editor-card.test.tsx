import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppViewEditorCard } from "@/components/chat/app-view-editor-card";

describe("AppViewEditorCard", () => {
  it("renders current kit, headline for kit change, rationale", () => {
    render(
      <AppViewEditorCard
        appId="habit-tracker"
        appName="Habit Tracker"
        currentKit="tracker"
        change={{ kind: "kit", proposedKit: "workflow-hub" }}
        rationale="You have 3 blueprints — workflow hub gives them dedicated lanes."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Habit Tracker/)).toBeTruthy();
    expect(screen.getByText(/currently tracker/)).toBeTruthy();
    expect(screen.getByText(/Switch to "workflow-hub" layout/)).toBeTruthy();
    expect(screen.getByText(/3 blueprints/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
  });

  it("renders bindings change with summary detail", () => {
    render(
      <AppViewEditorCard
        appId="finance-tracker"
        currentKit="ledger"
        change={{
          kind: "bindings",
          proposedBindingsSummary: "Hero=transactions; secondary=accounts,categories",
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Update view bindings/)).toBeTruthy();
    expect(screen.getByText(/Hero=transactions/)).toBeTruthy();
  });

  it("renders kpis change with count + summary", () => {
    render(
      <AppViewEditorCard
        appId="finance-tracker"
        currentKit="ledger"
        change={{
          kind: "kpis",
          proposedKpiCount: 3,
          proposedKpiSummary: "Net worth, savings rate, monthly burn",
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Set 3 KPI tiles/)).toBeTruthy();
    expect(screen.getByText(/Net worth/)).toBeTruthy();
  });

  it("Confirm calls onConfirm and shows Applied state", async () => {
    const onConfirm = vi.fn(async () => undefined);
    const onCancel = vi.fn();
    render(
      <AppViewEditorCard
        appId="habit-tracker"
        currentKit="tracker"
        change={{ kind: "kit", proposedKit: "workflow-hub" }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
    expect(onCancel).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText(/^Applied$/)).toBeTruthy();
    });
    // Buttons should be gone after applied.
    expect(screen.queryByRole("button", { name: /confirm/i })).toBeNull();
  });

  it("Cancel calls onCancel and shows Cancelled state", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <AppViewEditorCard
        appId="habit-tracker"
        currentKit="tracker"
        change={{ kind: "kit", proposedKit: "workflow-hub" }}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/Cancelled\. No changes written/)).toBeTruthy();
  });

  it("shows inline error when onConfirm throws", async () => {
    const onConfirm = vi.fn(async () => {
      throw new Error("App not found");
    });
    render(
      <AppViewEditorCard
        appId="ghost"
        currentKit="auto"
        change={{ kind: "kit", proposedKit: "tracker" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed: App not found/)).toBeTruthy();
    });
    // Buttons should still be present so the user can retry or cancel.
    expect(screen.getByRole("button", { name: /confirm/i })).toBeTruthy();
  });

  it("guards against double-confirm during pending state", async () => {
    let resolveConfirm: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );
    render(
      <AppViewEditorCard
        appId="habit-tracker"
        currentKit="tracker"
        change={{ kind: "kit", proposedKit: "workflow-hub" }}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    const btn = screen.getByRole("button", { name: /confirm/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    resolveConfirm();
    await waitFor(() => {
      expect(screen.getByText(/^Applied$/)).toBeTruthy();
    });
  });
});
