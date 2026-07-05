import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProfilePresetGallery } from "@/components/profiles/profile-preset-gallery";
import type { AgentProfile } from "@/lib/agents/profiles/types";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

function makePreset(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "researcher",
    name: "Researcher",
    description: "Web-enabled research agent",
    domain: "work",
    tags: [],
    systemPrompt: "",
    skillMd: "",
    supportedRuntimes: ["claude-code"],
    ...overrides,
  } as AgentProfile;
}

describe("ProfilePresetGallery (FEAT-13)", () => {
  afterEach(() => vi.clearAllMocks());

  it("renders one card per preset", () => {
    render(
      <ProfilePresetGallery
        presets={[makePreset(), makePreset({ id: "sweep", name: "Sweep" })]}
      />
    );
    expect(screen.getByText("Researcher")).toBeInTheDocument();
    expect(screen.getByText("Sweep")).toBeInTheDocument();
  });

  it("selecting a preset routes to the new-agent duplicate flow", () => {
    render(<ProfilePresetGallery presets={[makePreset()]} />);
    fireEvent.click(screen.getByText("Researcher"));
    expect(push).toHaveBeenCalledWith("/agents/researcher/edit?duplicate=true");
  });

  it("shows a Close affordance only when onClose is provided (toggle mode)", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <ProfilePresetGallery presets={[makePreset()]} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalled();

    // Standalone route (/presets) — no onClose, so no Close button.
    rerender(<ProfilePresetGallery presets={[makePreset()]} />);
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });

  it("renders an empty state when there are no presets", () => {
    render(<ProfilePresetGallery presets={[]} />);
    expect(screen.getByText(/no presets available/i)).toBeInTheDocument();
  });
});
