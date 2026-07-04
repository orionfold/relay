import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppMaterializedCard } from "../app-materialized-card";

describe("AppMaterializedCard", () => {
  const baseProps = {
    appId: "wealth-tracker",
    name: "Wealth Tracker",
    primitives: ["Agent", "Blueprint", "2 tables", "Monday 8am schedule"],
  };

  it("renders name with 'is live' copy and Running chip", () => {
    render(<AppMaterializedCard {...baseProps} />);
    expect(screen.getByText("Wealth Tracker")).toBeInTheDocument();
    expect(screen.getByText("is live")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders primitives summary joined with middle-dots", () => {
    render(<AppMaterializedCard {...baseProps} />);
    expect(
      screen.getByText(/Agent · Blueprint · 2 tables · Monday 8am schedule/)
    ).toBeInTheDocument();
  });

  it("Open app link deeplinks to /apps/[id]", () => {
    render(<AppMaterializedCard {...baseProps} />);
    const link = screen.getByRole("link", { name: /Open Wealth Tracker/i });
    expect(link).toHaveAttribute("href", "/apps/wealth-tracker");
  });

  it("hides View files button when files list is empty", () => {
    render(<AppMaterializedCard {...baseProps} />);
    expect(screen.queryByRole("button", { name: /View files/i })).toBeNull();
  });

  it("View files toggles the inline files list", () => {
    render(
      <AppMaterializedCard
        {...baseProps}
        files={["/tmp/a/manifest.yaml", "/tmp/a/README.md"]}
      />
    );
    const btn = screen.getByRole("button", { name: /View files/i });
    expect(screen.queryByText("/tmp/a/manifest.yaml")).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByText("/tmp/a/manifest.yaml")).toBeInTheDocument();
    expect(screen.getByText("/tmp/a/README.md")).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText("/tmp/a/manifest.yaml")).toBeNull();
  });

  it("calls onUndo when Undo is clicked", () => {
    const onUndo = vi.fn();
    render(<AppMaterializedCard {...baseProps} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole("button", { name: /Undo Wealth Tracker/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("hides Undo when canUndo is false", () => {
    render(<AppMaterializedCard {...baseProps} canUndo={false} onUndo={() => {}} />);
    expect(screen.queryByRole("button", { name: /Undo/i })).toBeNull();
  });

  it("shows 'was undone' copy when status = undone", () => {
    render(<AppMaterializedCard {...baseProps} status="undone" onUndo={() => {}} />);
    expect(screen.getByText("was undone")).toBeInTheDocument();
    // Undo should be hidden in undone state
    expect(screen.queryByRole("button", { name: /Undo/i })).toBeNull();
  });

  it("marks files list as informational (not a gate)", () => {
    render(
      <AppMaterializedCard
        {...baseProps}
        files={["/tmp/a/manifest.yaml"]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /View files/i }));
    expect(
      screen.getByText(/Informational.*No approval required/i)
    ).toBeInTheDocument();
  });
});
