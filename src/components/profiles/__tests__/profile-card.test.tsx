import { render, screen } from "@testing-library/react";

import { ProfileCard } from "@/components/profiles/profile-card";
import type { AgentProfile } from "@/lib/agents/profiles/types";

function makeProfile(overrides: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id: "general",
    name: "General",
    description: "A general profile",
    domain: "work",
    tags: [],
    systemPrompt: "",
    skillMd: "",
    supportedRuntimes: [
      "claude-code",
      "openai-codex-app-server",
      "anthropic-direct",
      "openai-direct",
      "ollama",
    ],
    ...overrides,
  };
}

describe("ProfileCard runtime-coverage chips", () => {
  it("renders a distinct short label for every runtime, not four collapsed to 'Claude'", () => {
    render(<ProfileCard profile={makeProfile()} isBuiltin onClick={() => {}} />);

    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    // The $0-local differentiator must NOT read "Claude".
    expect(screen.getByText("Ollama")).toBeInTheDocument();

    // Regression guard: exactly one "Claude" chip (the old ternary produced four).
    expect(screen.getAllByText("Claude")).toHaveLength(1);
  });

  it("surfaces Ollama distinctly for an ollama-only profile", () => {
    render(
      <ProfileCard
        profile={makeProfile({ supportedRuntimes: ["ollama"] })}
        onClick={() => {}}
      />
    );

    expect(screen.getByText("Ollama")).toBeInTheDocument();
    expect(screen.queryByText("Claude")).not.toBeInTheDocument();
  });
});

describe("ProfileCard pack provenance (FEAT-8)", () => {
  it("renders the PackPill when the profile belongs to an installed pack", () => {
    render(
      <ProfileCard
        profile={makeProfile({ id: "relay-agency--cre-analyst" })}
        packName="Relay Agency"
        onClick={() => {}}
      />
    );
    expect(screen.getByTestId("pack-pill")).toHaveTextContent("Relay Agency");
  });

  it("pack provenance OUTRANKS the Custom/origin fallback (never both)", () => {
    // A manual-origin profile that is pack-installed must read as its pack,
    // not "Custom" — the pill replaces the origin badge, doesn't stack with it.
    render(
      <ProfileCard
        profile={makeProfile({ id: "relay-agency--x", origin: "manual" })}
        packName="Relay Agency"
        onClick={() => {}}
      />
    );
    expect(screen.getByTestId("pack-pill")).toBeInTheDocument();
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  });

  it("falls back to the origin chain when there is no pack (null packName)", () => {
    render(
      <ProfileCard
        profile={makeProfile({ id: "my-notes", origin: "manual" })}
        packName={null}
        onClick={() => {}}
      />
    );
    expect(screen.queryByTestId("pack-pill")).not.toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });
});
