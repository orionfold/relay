import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PromptImpressionClaimError,
  RuntimePreferenceBootstrapper,
} from "@/components/onboarding/runtime-preference-bootstrapper";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock("sonner", () => ({
  toast: { error: toastError },
}));

vi.mock("@/components/onboarding/runtime-preference-modal", () => ({
  RuntimePreferenceModal: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Pick your default chat model</div> : null,
}));

afterEach(() => {
  toastError.mockReset();
  vi.unstubAllGlobals();
});

describe("RuntimePreferenceBootstrapper", () => {
  it("opens only after this browser wins the durable impression claim", async () => {
    const claimPromptImpression = vi.fn(async () => true);
    render(
      <StrictMode>
        <RuntimePreferenceBootstrapper
          claimPromptImpression={claimPromptImpression}
        />
      </StrictMode>
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(claimPromptImpression).toHaveBeenCalledTimes(1);
  });

  it("does not open for a reload or second browser that loses the claim", async () => {
    const claimPromptImpression = vi.fn(async () => false);
    render(
      <RuntimePreferenceBootstrapper
        claimPromptImpression={claimPromptImpression}
      />
    );

    await waitFor(() => expect(claimPromptImpression).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("surfaces a named visible failure and does not open an unrecorded prompt", async () => {
    const claimPromptImpression = vi.fn(async () => {
      throw new PromptImpressionClaimError(
        "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED",
        "Storage is read-only."
      );
    });
    render(
      <RuntimePreferenceBootstrapper
        claimPromptImpression={claimPromptImpression}
      />
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Default-model setup could not start",
        expect.objectContaining({
          description: expect.stringContaining(
            "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED"
          ),
        })
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses the production POST claim endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ claimed: true }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RuntimePreferenceBootstrapper />);

    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/chat/model-prompt-impression",
      { method: "POST" }
    );
  });

  it("names malformed server failures instead of silently ignoring them", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => {
        throw new Error("invalid response");
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RuntimePreferenceBootstrapper />);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "Default-model setup could not start",
        expect.objectContaining({
          description: expect.stringContaining(
            "MODEL_PREFERENCE_PROMPT_IMPRESSION_WRITE_FAILED"
          ),
        })
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
