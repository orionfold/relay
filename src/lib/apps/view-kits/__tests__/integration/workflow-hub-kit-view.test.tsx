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
    const workflows = container.querySelector('[data-kit-slot-section="workflow"]');
    expect(workflows).toBeInTheDocument();
    expect(workflows).toHaveTextContent("Workflows");
    expect(workflows).toHaveTextContent("Each card below is a workflow this app can run.");
    expect(workflows).toHaveTextContent("Pick a workflow below.");
  });

  it("renders the funnel flow as a full-width secondary row before workflow cards", () => {
    const { container } = renderKitView({
      kit: workflowHubKit,
      manifest,
      columns: [],
      runtime: {
        funnelData: {
          title: "Lead funnel",
          bands: [],
        },
        blueprintCards: [
          { id: "ingest", name: "Ingest", description: null, variables: [], trigger: null, isPrimary: true },
          { id: "transform", name: "Transform", description: null, variables: [], trigger: null, isPrimary: false },
        ],
        blueprintLastRuns: {},
        blueprintRunCounts: {},
        failedTasks: [],
      },
    });

    expect(screen.getByText("Lead funnel")).toBeInTheDocument();
    const secondary = Array.from(container.querySelectorAll('[data-kit-slot="secondary"]'));
    expect(secondary[0]).toHaveAttribute("data-kit-slot-width", "full");
    expect(secondary[1]).toHaveAttribute("data-kit-slot-width", "auto");
  });

  it("renders an honest 'couldn't load' state (no Run button) for an unresolved blueprint (#31)", () => {
    // A blueprint whose definition the registry could not resolve at enrichment
    // time arrives with `resolved: false` and the id as its name. It must NOT
    // render a fake Run button (which would fail downstream at /instantiate);
    // it renders an explicit failure state instead (engineering principle #1).
    renderKitView({
      kit: workflowHubKit,
      manifest,
      columns: [],
      runtime: {
        blueprintCards: [
          {
            id: "relay-agency--lease-abstraction",
            name: "relay-agency--lease-abstraction",
            description: null,
            variables: [],
            trigger: null,
            isPrimary: false,
            resolved: false,
          },
        ],
        blueprintLastRuns: {},
        blueprintRunCounts: {},
        failedTasks: [],
      },
    });
    // Honest failure copy is shown…
    expect(screen.getByText(/couldn't load/i)).toBeInTheDocument();
    // …and there is NO Run button on a husk card.
    expect(
      screen.queryByRole("button", { name: /^run$/i })
    ).not.toBeInTheDocument();
  });

  it("renders a Run button for a resolved blueprint (#31 regression guard)", () => {
    renderKitView({
      kit: workflowHubKit,
      manifest,
      columns: [],
      runtime: {
        blueprintCards: [
          {
            id: "ingest",
            name: "Ingest",
            description: "Pulls new rows",
            variables: [],
            trigger: null,
            isPrimary: true,
            resolved: true,
          },
        ],
        blueprintLastRuns: { ingest: null },
        blueprintRunCounts: { ingest: 0 },
        failedTasks: [],
      },
    });
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
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
