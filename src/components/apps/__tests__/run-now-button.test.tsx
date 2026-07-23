import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunNowButton } from "../run-now-button";
import type { BlueprintVariable } from "@/lib/workflows/blueprints/types";

// Capture toast calls so we can assert honest copy per verb.
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe("RunNowButton — two verbs (FEAT-6)", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it("renders nothing when blueprintId is missing", () => {
    const { container } = render(<RunNowButton blueprintId={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders both Run and Create workflow buttons", () => {
    render(<RunNowButton blueprintId="bp-1" />);
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create workflow/i })
    ).toBeInTheDocument();
  });

  it("Run instantiates THEN executes and toasts that the run started", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: "started", workflowId: "wf-1" }) });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<RunNowButton blueprintId="bp-1" />);
    const runButton = screen.getByRole("button", { name: /^run$/i });
    await waitFor(() => expect(runButton).toBeEnabled());
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        "/api/blueprints/bp-1/readiness",
        expect.objectContaining({ cache: "no-store" })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        "/api/blueprints/bp-1/start",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringMatching(/run started/i),
        expect.anything()
      )
    );
    const options = toastSuccess.mock.calls.at(-1)?.[1] as {
      action?: { props?: { href?: string } };
    };
    expect(options.action?.props?.href).toBe("/workflows/wf-1");
  });

  it("Create workflow instantiates only (no execute) and toasts a draft", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ workflowId: "wf-2" }) });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<RunNowButton blueprintId="bp-1" />);
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/blueprints/bp-1/readiness",
      expect.anything(),
    ));
    fireEvent.click(screen.getByRole("button", { name: /create workflow/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/blueprints/bp-1/instantiate",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        expect.stringMatching(/draft created/i),
        expect.anything()
      )
    );
  });

  it("Run that fails to execute toasts an error and never claims it started", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "Workflow is already running" }) });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<RunNowButton blueprintId="bp-1" />);
    const runButton = screen.getByRole("button", { name: /^run$/i });
    await waitFor(() => expect(runButton).toBeEnabled());
    fireEvent.click(runButton);

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("disables both buttons while a request is in flight", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ready: true }) })
      .mockImplementationOnce(() => new Promise(() => {}));
    global.fetch = mockFetch as unknown as typeof fetch;
    render(<RunNowButton blueprintId="bp-1" />);
    const runBtn = screen.getByRole("button", { name: /^run$/i });
    await waitFor(() => expect(runBtn).toBeEnabled());
    fireEvent.click(runBtn);
    await waitFor(() => {
      expect(runBtn).toBeDisabled();
      expect(screen.getByRole("button", { name: /create workflow/i })).toBeDisabled();
    });
  });

  it("refreshes a blocked blueprint after provider configuration changes", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ready: false, message: "No eligible runtime" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ready: true }),
      });
    global.fetch = mockFetch as unknown as typeof fetch;

    render(<RunNowButton blueprintId="bp-1" showReadiness />);
    const runButton = screen.getByRole("button", { name: /^run$/i });
    await waitFor(() => expect(screen.getByText("Setup needed")).toBeInTheDocument());
    expect(runButton).toBeDisabled();

    fireEvent(window, new Event("relay:runtime-readiness-changed"));

    await waitFor(() => expect(screen.getByText("Ready")).toBeInTheDocument());
    expect(runButton).toBeEnabled();
  });
});

describe("RunNowButton — variable path delegates to the sheet", () => {
  it("renders two sheet triggers (Run + Create workflow) when variables are declared", () => {
    const vars: BlueprintVariable[] = [
      { id: "x", type: "text", label: "X", required: true },
    ];
    render(<RunNowButton blueprintId="bp1" variables={vars} />);
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create workflow/i })
    ).toBeInTheDocument();
  });

  it("renders the direct two-button group when variables is empty", () => {
    render(<RunNowButton blueprintId="bp1" variables={[]} />);
    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
  });

  it("renders nothing when blueprintId is null", () => {
    const { container } = render(
      <RunNowButton blueprintId={null} variables={null} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
