import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { DocumentPickerSheet } from "@/components/shared/document-picker-sheet";

const documents = [
  {
    id: "processing-doc",
    originalName: "processing.txt",
    mimeType: "text/plain",
    size: 10,
    direction: "input",
    status: "processing",
    category: null,
    taskTitle: null,
    projectName: "Acme",
    createdAt: Date.now(),
  },
  {
    id: "error-doc",
    originalName: "error.txt",
    mimeType: "text/plain",
    size: 10,
    direction: "input",
    status: "error",
    category: null,
    taskTitle: null,
    projectName: "Acme",
    createdAt: Date.now(),
  },
  {
    id: "ready-doc",
    originalName: "ready.txt",
    mimeType: "text/plain",
    size: 10,
    direction: "input",
    status: "ready",
    category: null,
    taskTitle: null,
    projectName: "Acme",
    createdAt: Date.now(),
  },
];

describe("DocumentPickerSheet readiness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows non-ready project documents but only allows ready selection", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(documents), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <DocumentPickerSheet
        open
        onOpenChange={() => {}}
        projectId="project-1"
        selectedIds={new Set()}
        onConfirm={() => {}}
      />
    );

    const processingName = await screen.findByText("processing.txt");
    const errorName = screen.getByText("error.txt");
    const readyName = screen.getByText("ready.txt");

    expect(processingName.closest('[role="button"]')).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    expect(errorName.closest('[role="button"]')).toHaveAttribute(
      "aria-disabled",
      "true"
    );
    const readyRow = readyName.closest('[role="button"]') as HTMLElement;
    expect(readyRow).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(readyRow);
    await waitFor(() => {
      expect(screen.getByRole("checkbox", { name: "Select ready.txt" }))
        .toBeChecked();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/documents?projectId=project-1"
    );
  });

  it("surfaces a document load failure instead of an empty pool", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Document store unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    render(
      <DocumentPickerSheet
        open
        onOpenChange={() => {}}
        projectId="project-1"
        selectedIds={new Set()}
        onConfirm={() => {}}
      />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Document store unavailable"
    );
  });
});
