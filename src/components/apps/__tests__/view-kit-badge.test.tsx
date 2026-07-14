import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ViewKitBadge } from "@/components/apps/view-kit-badge";

describe("ViewKitBadge", () => {
  it.each([
    ["tracker", "Tracker view"],
    ["workflow-hub", "Workflow Hub view"],
    ["coach", "Coach view"],
    ["ledger", "Ledger view"],
    ["inbox", "Inbox view"],
    ["research", "Research view"],
  ] as const)("renders the %s family for explicit and inferred sources", (id, label) => {
    const { rerender } = render(
      <ViewKitBadge
        resolution={{ id, source: "explicit", explanation: "Explicit manifest selection." }}
      />,
    );
    expect(screen.getByLabelText(`${label}, selected by this app`)).toHaveTextContent("Explicit");

    rerender(
      <ViewKitBadge
        resolution={{ id, source: "inferred", explanation: "Deterministic inference selection." }}
      />,
    );
    expect(screen.getByLabelText(`${label}, inferred by Relay`)).toHaveTextContent("Inferred");
  });

  it("labels an inferred kit and explains how to enable diagnostics", async () => {
    render(
      <ViewKitBadge
        resolution={{
          id: "coach",
          source: "inferred",
          explanation: "The coach rule matched a scheduled coach profile.",
        }}
      />,
    );

    const badge = screen.getByLabelText("Coach view, inferred by Relay");
    expect(badge).toHaveTextContent("Coach view");
    expect(badge).toHaveTextContent("Inferred");
    fireEvent.pointerMove(badge);
    expect((await screen.findAllByText("The coach rule matched a scheduled coach profile.")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("links an explicit kit to its gated diagnostics route", () => {
    render(
      <ViewKitBadge
        resolution={{
          id: "ledger",
          source: "explicit",
          explanation: "The app manifest explicitly declares view.kit: ledger.",
          diagnosticsHref: "/apps/ledger/inference",
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "Ledger view, selected by this app. Inspect selection" }))
      .toHaveAttribute("href", "/apps/ledger/inference");
    expect(screen.getByText("Explicit")).toBeInTheDocument();
  });
});
