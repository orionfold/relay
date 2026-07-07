import { vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { WelcomeLanding } from "@/components/dashboard/welcome-landing";
import type { StarterTemplate } from "@/lib/apps/starters";

// StarterTemplateCard uses next/navigation's useRouter — mock it so the
// component can mount in jsdom without an App Router context.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const STARTERS: StarterTemplate[] = [
  {
    id: "finance-pack",
    name: "Finance pack",
    description: "Monthly close.",
    persona: "personal-finance",
    icon: "wallet",
    starterPrompt: "Build me a personal finance dashboard.",
    preview: { profiles: 1, blueprints: 1, tables: 1, schedules: 1 },
  },
  {
    id: "habit-tracker",
    name: "Habit tracker",
    description: "Daily habits.",
    persona: "personal",
    icon: "check-circle",
    starterPrompt: "Build me a daily habit tracker.",
    preview: { profiles: 1, blueprints: 1, tables: 2, schedules: 1 },
  },
  {
    id: "research-digest",
    name: "Research digest",
    description: "Weekly synthesis.",
    persona: "research",
    icon: "library",
    starterPrompt: "Build me a research digest.",
    preview: { profiles: 1, blueprints: 1, tables: 1, schedules: 1 },
  },
];

describe("WelcomeLanding", () => {
  it("shows the packs-first CTA cluster and starter row when starters exist", () => {
    render(<WelcomeLanding starters={STARTERS} />);

    // Packs-first CTA is the primary entry point
    expect(screen.getByRole("link", { name: /build your first pack/i })).toHaveAttribute("href", "/chat");
    // Secondary CTA still routes into the workspace
    expect(screen.getByRole("link", { name: /browse the workspace/i })).toHaveAttribute("href", "/tasks");
    // Starter cards render
    expect(screen.getByText(/finance pack/i)).toBeInTheDocument();
    expect(screen.getByText(/habit tracker/i)).toBeInTheDocument();
    expect(screen.getByText(/research digest/i)).toBeInTheDocument();
    // "Browse packs" routes to the pack browser
    expect(screen.getByRole("link", { name: /browse packs/i })).toHaveAttribute("href", "/packs");
    // Packs-first pillar copy reframes the marquee feature
    expect(screen.getByText(/packs from a sentence/i)).toBeInTheDocument();
  });

  it("renders a usable hero even when no starters are available", () => {
    render(<WelcomeLanding />);
    // Primary CTA still visible — starter row hides cleanly
    expect(screen.getByRole("link", { name: /build your first pack/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /browse packs/i })).toBeNull();
  });
});
