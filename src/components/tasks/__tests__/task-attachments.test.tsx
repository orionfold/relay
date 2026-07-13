import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskAttachments, type TaskDocumentSummary } from "../task-attachments";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const output: TaskDocumentSummary = {
  id: "doc-output",
  originalName: "report.md",
  mimeType: "text/markdown",
  size: 2048,
  version: 2,
  direction: "output",
};
const input: TaskDocumentSummary = {
  ...output,
  id: "doc-input",
  originalName: "brief.md",
  direction: "input",
};

describe("TaskAttachments", () => {
  beforeEach(() => {
    push.mockClear();
    vi.restoreAllMocks();
  });

  it("makes output rows and View actions navigable while keeping input rows passive", () => {
    render(<TaskAttachments documents={[output, input]} />);
    expect(screen.getByRole("link", { name: "report.md" })).toHaveAttribute(
      "href",
      "/documents/doc-output",
    );
    expect(screen.getByRole("link", { name: "View report.md" })).toHaveAttribute(
      "href",
      "/documents/doc-output",
    );
    expect(screen.queryByRole("link", { name: "brief.md" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("report.md").closest("div.group")!);
    expect(push).toHaveBeenCalledWith("/documents/doc-output");
  });

  it("isolates View, Download, Delete, and text selection from row navigation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onDeleted = vi.fn();
    render(<TaskAttachments documents={[output]} onDeleted={onDeleted} />);

    const viewLink = screen.getByRole("link", { name: "View report.md" });
    const downloadLink = screen.getByRole("link", { name: "Download report.md" });
    viewLink.addEventListener("click", (event) => event.preventDefault());
    downloadLink.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(viewLink);
    fireEvent.click(downloadLink);
    fireEvent.click(screen.getByRole("button", { name: "Delete report.md" }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(push).not.toHaveBeenCalled();

    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      toString: () => "report.md",
    } as Selection);
    fireEvent.click(screen.getByText("report.md").closest("div.group")!);
    expect(push).not.toHaveBeenCalled();
  });

  it("can omit destructive actions in Inbox previews", () => {
    render(<TaskAttachments documents={[output]} showDelete={false} />);
    expect(screen.queryByRole("button", { name: "Delete report.md" })).not.toBeInTheDocument();
  });
});
