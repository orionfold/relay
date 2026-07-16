import { render, screen } from "@testing-library/react";
import {
  calculateMasonrySpan,
  DashboardMasonry,
} from "@/components/dashboard/dashboard-masonry";

describe("DashboardMasonry", () => {
  it("uses measured dense grid columns instead of sequential CSS columns", () => {
    const { container } = render(
      <DashboardMasonry>
        <article>Needs attention</article>
        <article>Autonomous activity</article>
        <article>Recent outputs</article>
        <article>Installed apps</article>
        <article>Projects</article>
      </DashboardMasonry>
    );

    const topRow = container.querySelector("[data-dashboard-top-row]");
    expect(topRow).toHaveClass(
      "grid",
      "grid-cols-1",
      "md:grid-cols-2",
      "xl:grid-cols-3"
    );
    const packed = container.querySelector("[data-dashboard-packed-grid]");
    expect(packed).toHaveClass(
      "grid",
      "md:grid-cols-2",
      "xl:grid-cols-3",
      "[grid-auto-flow:dense]"
    );
    expect(container.querySelector(".columns-1")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(5);
  });

  it("calculates a bounded row span from measured content", () => {
    expect(calculateMasonrySpan(300, 1, 16)).toBe(19);
    expect(calculateMasonrySpan(0, 1, 16)).toBe(1);
  });
});
