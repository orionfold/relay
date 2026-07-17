import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";

import { DocumentUploadDialog } from "@/components/documents/document-upload-dialog";

const fetchMock = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

function DocumentUploadHarness({ withProject = false }: { withProject?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Upload documents
      </button>
      <DocumentUploadDialog
        open={open}
        onClose={() => setOpen(false)}
        onUploaded={() => {}}
        restoreFocusElement={triggerRef.current}
        projects={withProject ? [{ id: "project-1", name: "Acme" }] : []}
        defaultProjectId={withProject ? "project-1" : null}
      />
    </>
  );
}

describe("document upload dialog accessibility", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns focus to the opener when the dialog closes", async () => {
    render(<DocumentUploadHarness />);

    const trigger = screen.getByRole("button", { name: "Upload documents" });
    fireEvent.click(trigger);

    const doneButton = await screen.findByRole("button", { name: "Done" });
    fireEvent.click(doneButton);

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("includes the selected project in every upload", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: "document-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      })
    );
    render(<DocumentUploadHarness withProject />);
    fireEvent.click(screen.getByRole("button", { name: "Upload documents" }));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["hello"], "hello.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("projectId")).toBe("project-1");
  });
});
