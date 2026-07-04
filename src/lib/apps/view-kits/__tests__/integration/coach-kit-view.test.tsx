import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { coachKit } from "../../kits/coach";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => "/",
}));

const manifest = {
  id: "wpci",
  name: "Weekly portfolio check-in",
  description: "Markdown digest hero",
  profiles: [{ id: "wealth-coach" }],
  blueprints: [{ id: "weekly-checkin", name: "Weekly check-in" }],
  schedules: [{ id: "mon-8am", cron: "0 8 * * 1", runs: "weekly-checkin" }],
  tables: [],
} as any;

describe("Coach kit — KitView integration", () => {
  it("renders cadence chip + Run Now button + digest hero", () => {
    const { container } = renderKitView({
      kit: coachKit,
      manifest,
      columns: [],
      runtime: {
        cadence: { humanLabel: "Mondays at 8am", nextFireMs: null },
        coachLatestTask: {
          id: "t1",
          title: "Last check-in",
          status: "completed",
          createdAt: Date.now(),
          result: "## Portfolio update\n\nYTD up 8%",
        },
        coachPreviousRuns: [],
      },
    });
    expect(screen.getByText(/mondays at 8am/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(container.querySelector('[data-kit-slot="hero"]')).toBeInTheDocument();
    expect(screen.getByText(/portfolio update/i)).toBeInTheDocument();
  });
});
