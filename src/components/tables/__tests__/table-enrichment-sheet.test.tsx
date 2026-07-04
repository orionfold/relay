import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { TableEnrichmentSheet } from "@/components/tables/table-enrichment-sheet";
import type { EnrichmentPlan } from "@/lib/tables/enrichment-planner";
import type { ColumnDef } from "@/lib/tables/types";

const { pushMock, toastErrorMock, toastSuccessMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

const columns: ColumnDef[] = [
  {
    name: "company",
    displayName: "Company",
    dataType: "text",
    position: 0,
    required: false,
    defaultValue: null,
    config: null,
  },
];

const previewPlan: EnrichmentPlan = {
  promptMode: "auto",
  strategy: "single-pass-lookup",
  agentProfile: "general",
  reasoning: "Keep the row flow lightweight.",
  steps: [
    {
      id: "lookup",
      name: "Lookup value",
      purpose: "Determine the final typed value for this row",
      prompt: "Return only the final value.",
      agentProfile: "general",
    },
  ],
  targetContract: {
    columnName: "company",
    columnLabel: "Company",
    dataType: "text",
  },
  eligibleRowCount: 2,
  sampleBindings: [{ id: "row-1", company: "Acme" }],
};

describe("TableEnrichmentSheet", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/agents") {
          return Promise.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue([{ id: "general", name: "General" }]),
          });
        }
        if (url === "/api/tables/table-1/enrich/plan") {
          return Promise.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue(previewPlan),
          });
        }
        if (url === "/api/tables/table-1/enrich") {
          return Promise.resolve({
            ok: true,
            json: vi.fn().mockResolvedValue({ workflowId: "workflow-1", rowCount: 2 }),
          });
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("keeps a fresh preview launchable when using the planner recommendation", async () => {
    render(
      <TableEnrichmentSheet
        open
        onOpenChange={() => {}}
        tableId="table-1"
        columns={columns}
      />
    );

    const dialog = await screen.findByRole("dialog", { name: "Enrich Table" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Preview Plan" }));

    await screen.findByText("Keep the row flow lightweight.");

    expect(
      screen.queryByText("Inputs changed after the last preview. Refresh the plan before launching.")
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Launch Enrichment" })).toBeEnabled();
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Launch Enrichment" }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        "/api/tables/table-1/enrich",
        expect.objectContaining({ method: "POST" })
      );
      expect(pushMock).toHaveBeenCalledWith("/workflows/workflow-1");
      expect(toastErrorMock).not.toHaveBeenCalled();
      expect(toastSuccessMock).toHaveBeenCalled();
    });
  });
});
