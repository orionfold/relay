import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderKitView } from "../render-kit-view";
import { workflowHubKit } from "../../kits/workflow-hub";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => "/",
}));

const manifest = {
  id: "ops",
  name: "Ops hub",
  description: "Multi-blueprint orchestration",
  profiles: [],
  blueprints: [
    { id: "ingest", name: "Ingest" },
    { id: "transform", name: "Transform" },
    { id: "publish", name: "Publish" },
  ],
  schedules: [],
  tables: [],
} as any;

describe("Workflow Hub kit — KitView integration", () => {
  it("renders header + KPIs + secondary cards per blueprint", () => {
    const { container } = renderKitView({
      kit: workflowHubKit,
      manifest,
      columns: [],
      runtime: {
        evaluatedKpis: [
          { id: "k1", label: "Runs (7d)", value: "12" },
          { id: "k2", label: "Failures", value: "1" },
        ],
        blueprintCards: [
          { id: "ingest", name: "Ingest", description: null, variables: [], trigger: null, isPrimary: true },
          { id: "transform", name: "Transform", description: null, variables: [], trigger: null, isPrimary: false },
          { id: "publish", name: "Publish", description: null, variables: [], trigger: null, isPrimary: false },
        ],
        blueprintLastRuns: {
          ingest: { id: "t1", title: "Ingest run", status: "completed", createdAt: 0, result: null },
          transform: { id: "t2", title: "Transform run", status: "failed", createdAt: 0, result: null },
          publish: null,
        },
        blueprintRunCounts: { ingest: 5, transform: 4, publish: 0 },
        failedTasks: [],
      },
    });
    expect(screen.getByText(/runs \(7d\)/i)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-kit-slot="secondary"]').length).toBeGreaterThanOrEqual(1);
  });

  it("renders activity feed with failed tasks when present", () => {
    const { container } = renderKitView({
      kit: workflowHubKit,
      manifest,
      columns: [],
      runtime: {
        failedTasks: [
          { id: "t-failed", title: "Transform run", status: "failed", createdAt: Date.now(), result: null },
        ],
      },
    });
    expect(container.querySelector('[data-kit-slot="activity"]')).toBeInTheDocument();
  });
});
