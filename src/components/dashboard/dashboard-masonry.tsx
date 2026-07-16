"use client";

import {
  Children,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";

const MASONRY_ROW_HEIGHT = 1;

export function calculateMasonrySpan(
  contentHeight: number,
  rowHeight: number,
  rowGap: number
): number {
  return Math.max(
    1,
    Math.ceil((Math.max(0, contentHeight) + rowGap) / (rowHeight + rowGap))
  );
}

export function DashboardMasonry({ children }: { children: ReactNode }) {
  const items = Children.toArray(children);
  const topRow = items.slice(0, 3);
  const packed = items.slice(3);

  return (
    <div data-dashboard-layout="balanced-masonry">
      <div
        data-dashboard-top-row=""
        className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        {topRow.map((child, index) => (
          <div
            key={`dashboard-top-${index}`}
            className={
              index === 2
                ? "min-w-0 md:col-span-2 xl:col-span-1"
                : "min-w-0"
            }
          >
            {child}
          </div>
        ))}
      </div>
      {packed.length > 0 && (
        <MeasuredMasonryGrid>{packed}</MeasuredMasonryGrid>
      )}
    </div>
  );
}

function MeasuredMasonryGrid({ children }: { children: ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const items = Array.from(
      grid.querySelectorAll<HTMLElement>("[data-dashboard-masonry-item]")
    );

    grid.style.gridAutoRows = `${MASONRY_ROW_HEIGHT}px`;

    const update = (item: HTMLElement) => {
      const content = item.querySelector<HTMLElement>(
        "[data-dashboard-masonry-content]"
      );
      if (!content) return;
      const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
      item.style.gridRowEnd = `span ${calculateMasonrySpan(
        content.getBoundingClientRect().height,
        MASONRY_ROW_HEIGHT,
        rowGap
      )}`;
    };

    const updateAll = () => items.forEach(update);
    updateAll();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            for (const entry of entries) {
              const item = entry.target.closest<HTMLElement>(
                "[data-dashboard-masonry-item]"
              );
              if (item) update(item);
            }
          });

    for (const item of items) {
      const content = item.querySelector<HTMLElement>(
        "[data-dashboard-masonry-content]"
      );
      if (content) observer?.observe(content);
    }
    window.addEventListener("resize", updateAll);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateAll);
    };
  }, [children]);

  return (
    <div
      ref={gridRef}
      data-dashboard-packed-grid=""
      className="mt-4 grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 xl:grid-cols-3 [grid-auto-flow:dense]"
    >
      {Children.map(children, (child) =>
        child ? (
          <div
            data-dashboard-masonry-item=""
            className="min-w-0 self-start"
          >
            <div data-dashboard-masonry-content="">{child}</div>
          </div>
        ) : null
      )}
    </div>
  );
}
