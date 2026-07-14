import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KPIStrip } from "../kpi-strip";
import type { KpiTile } from "@/lib/apps/view-kits/types";

describe("KPIStrip", () => {
  const tile = (id: string, label: string, value: string): KpiTile => ({
    id,
    label,
    value,
  });

  it("renders nothing when tiles is empty", () => {
    const { container } = render(<KPIStrip tiles={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders one tile with label and value", () => {
    render(<KPIStrip tiles={[tile("a", "Active", "5")]} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders 6 tiles in a responsive grid", () => {
    const tiles = Array.from({ length: 6 }, (_, i) =>
      tile(`k${i}`, `Label ${i}`, `${i * 10}`)
    );
    render(<KPIStrip tiles={tiles} />);
    expect(screen.getByText("Label 0")).toBeInTheDocument();
    expect(screen.getByText("Label 5")).toBeInTheDocument();
  });

  it("renders the optional hint when present", () => {
    render(
      <KPIStrip
        tiles={[{ id: "a", label: "Active", value: "5", hint: "in last 7d" }]}
      />
    );
    expect(screen.getByText("in last 7d")).toBeInTheDocument();
  });

  it("clips at 6 tiles when more are passed", () => {
    const tiles = Array.from({ length: 8 }, (_, i) =>
      tile(`k${i}`, `Label ${i}`, `${i}`)
    );
    render(<KPIStrip tiles={tiles} />);
    expect(screen.queryByText("Label 6")).toBeNull();
    expect(screen.queryByText("Label 7")).toBeNull();
  });

  it("renders named comparison, momentum, favorability, and an aligned watermark", () => {
    const summary =
      "Revenue is $300.00. Up $200.00 vs first observed day. Latest movement up. Overall movement is favorable; latest movement is favorable.";
    const { container } = render(
      <KPIStrip
        tiles={[
          {
            id: "revenue",
            label: "Revenue",
            value: "$300.00",
            spark: [100, 200, 300],
            trend: {
              state: "ready",
              comparison: {
                direction: "up",
                favorability: "favorable",
                label: "Up $200.00 vs first observed day",
              },
              momentum: {
                direction: "up",
                favorability: "favorable",
                label: "Latest movement up",
              },
              watermark: "up",
              summary,
            },
          },
        ]}
      />
    );

    expect(
      screen.getByText("Up $200.00 vs first observed day · Favorable")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Latest movement up · Favorable")
    ).toBeInTheDocument();
    const card = container.querySelector('[data-kit-primitive="kpi-tile"]');
    expect(card).toHaveAttribute("data-comparison-direction", "up");
    expect(card).toHaveAttribute("data-momentum-direction", "up");
    expect(card).toHaveAttribute("data-favorability", "favorable");
    expect(card).toHaveAttribute("aria-label", summary);
    expect(card).toHaveAttribute("role", "group");
    expect(container.querySelector('[data-kpi-watermark="up"]')).not.toBeNull();
    expect(container.querySelector('svg[aria-label^="Revenue:"] polyline')).toHaveAttribute(
      "stroke",
      "var(--status-completed)"
    );
  });

  it("omits the watermark when comparison and latest momentum diverge", () => {
    const { container } = render(
      <KPIStrip
        tiles={[
          {
            id: "rebound",
            label: "Rebound",
            value: "80",
            spark: [100, 50, 80],
            trend: {
              state: "ready",
              comparison: {
                direction: "down",
                favorability: "unfavorable",
                label: "Down 20 vs first observed day",
              },
              momentum: {
                direction: "up",
                favorability: "favorable",
                label: "Latest movement up",
              },
              summary:
                "Rebound is 80. Down 20 vs first observed day. Latest movement up. Overall movement is unfavorable; latest movement is favorable.",
            },
          },
        ]}
      />
    );

    expect(container.querySelector("[data-kpi-watermark]")).toBeNull();
    expect(container.querySelector('svg[aria-label^="Rebound:"] polyline')).toHaveAttribute(
      "stroke",
      "var(--status-completed)"
    );
  });

  it("renders the explicit sparse state without an icon or watermark", () => {
    const { container } = render(
      <KPIStrip
        tiles={[
          {
            id: "sparse",
            label: "Sparse",
            value: "1",
            trend: {
              state: "sparse",
              label: "Need 2 observations",
              summary: "Sparse is 1. Need 2 observations for comparison.",
            },
          },
        ]}
      />
    );

    expect(screen.getByText("Need 2 observations")).toBeInTheDocument();
    expect(container.querySelector('[data-trend-state="sparse"]')).toHaveAttribute(
      "aria-label",
      "Sparse is 1. Need 2 observations for comparison."
    );
    expect(container.querySelector("[data-kpi-watermark]")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
  });
});
