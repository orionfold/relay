import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RuntimePreferenceModal } from "@/components/onboarding/runtime-preference-modal";

function setup({
  fetchOllamaModels = vi.fn(async () => []),
  persistChoice = vi.fn(async () => undefined),
  onClose = vi.fn(),
}: {
  fetchOllamaModels?: () => Promise<{ name: string }[]>;
  persistChoice?: (input: {
    preference: "quality" | "cost" | "privacy" | "balanced" | null;
    defaultModel: string;
  }) => Promise<void>;
  onClose?: () => void;
} = {}) {
  render(
    <RuntimePreferenceModal
      open
      onClose={onClose}
      fetchOllamaModels={fetchOllamaModels}
      persistChoice={persistChoice}
    />
  );
  return { fetchOllamaModels, persistChoice, onClose };
}

describe("RuntimePreferenceModal", () => {
  it("renders the four preference options with capability notes", () => {
    setup();
    expect(screen.getByText("Best quality")).toBeTruthy();
    expect(screen.getByText("Balanced (recommended)")).toBeTruthy();
    expect(screen.getByText("Lowest cost")).toBeTruthy();
    expect(screen.getByText("Privacy-focused (verify endpoint)")).toBeTruthy();
    expect(
      screen.getByText(/Our smartest model \(Opus\)/i)
    ).toBeTruthy();
    expect(
      screen.getByText(/Uses your configured Ollama endpoint/i)
    ).toBeTruthy();
  });

  it("defaults to balanced and confirms with sonnet model id", async () => {
    const persistChoice = vi.fn(async () => undefined);
    const onClose = vi.fn();
    setup({ persistChoice, onClose });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(persistChoice).toHaveBeenCalledWith({
        preference: "balanced",
        defaultModel: "sonnet",
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("persists quality preference with opus model id", async () => {
    const persistChoice = vi.fn(async () => undefined);
    setup({ persistChoice });

    fireEvent.click(screen.getByLabelText(/Best quality/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(persistChoice).toHaveBeenCalledWith({
        preference: "quality",
        defaultModel: "opus",
      });
    });
  });

  it("persists cost preference with haiku model id", async () => {
    const persistChoice = vi.fn(async () => undefined);
    setup({ persistChoice });

    fireEvent.click(screen.getByLabelText(/Lowest cost/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(persistChoice).toHaveBeenCalledWith({
        preference: "cost",
        defaultModel: "haiku",
      });
    });
  });

  it("Skip writes balanced default with null preference and closes", async () => {
    const persistChoice = vi.fn(async () => undefined);
    const onClose = vi.fn();
    setup({ persistChoice, onClose });

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    await waitFor(() => {
      expect(persistChoice).toHaveBeenCalledWith({
        preference: null,
        defaultModel: "sonnet",
      });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("privacy with discovered ollama model persists ollama: prefix", async () => {
    const persistChoice = vi.fn(async () => undefined);
    const fetchOllamaModels = vi.fn(async () => [
      { name: "llama3.1:latest" },
      { name: "qwen2.5" },
    ]);
    setup({ persistChoice, fetchOllamaModels });

    fireEvent.click(screen.getByLabelText(/Privacy-focused/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => {
      expect(persistChoice).toHaveBeenCalledWith({
        preference: "privacy",
        defaultModel: "ollama:llama3.1:latest",
      });
    });
  });

  it("persist failure keeps the modal open, shows the error, and allows retry (#22)", async () => {
    const persistChoice = vi
      .fn<
        (input: {
          preference: "quality" | "cost" | "privacy" | "balanced" | null;
          defaultModel: string;
        }) => Promise<void>
      >()
      .mockRejectedValueOnce(new Error("HTTP 500"))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    setup({ persistChoice, onClose });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // The failed save must be visible (zero silent failures) and must NOT
    // close the modal as if it had succeeded.
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    // Retry succeeds and closes.
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(persistChoice).toHaveBeenCalledTimes(2);
  });

  it("Skip failure also surfaces the error instead of closing", async () => {
    const persistChoice = vi.fn(async () => {
      throw new Error("HTTP 500");
    });
    const onClose = vi.fn();
    setup({ persistChoice, onClose });

    fireEvent.click(screen.getByRole("button", { name: /skip/i }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("default persist PUTs with keepalive so navigation cannot abort the write (#22)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    try {
      render(<RuntimePreferenceModal open onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/settings/chat",
          expect.objectContaining({ method: "PUT", keepalive: true })
        );
      });
      await waitFor(() => expect(onClose).toHaveBeenCalled());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("default persist treats a non-ok response as a failure (no silent close)", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const onClose = vi.fn();
    try {
      render(<RuntimePreferenceModal open onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: /continue/i }));

      expect(await screen.findByRole("alert")).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("privacy with empty ollama list shows fallback note + balanced default + does NOT close until dismissed", async () => {
    const persistChoice = vi.fn(async () => undefined);
    const fetchOllamaModels = vi.fn(async () => []);
    const onClose = vi.fn();
    setup({ persistChoice, fetchOllamaModels, onClose });

    fireEvent.click(screen.getByLabelText(/Privacy-focused/i));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    // Persists user's stated privacy preference paired with the balanced
    // fallback model so chat still works. The mismatch is intentional —
    // it surfaces the gap in Settings so the user knows to install Ollama.
    await waitFor(() => {
      expect(persistChoice).toHaveBeenCalledWith({
        preference: "privacy",
        defaultModel: "sonnet",
      });
    });

    expect(
      await screen.findByText(/We could not find an Ollama model/i)
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    // Dismissal closes the modal.
    fireEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
