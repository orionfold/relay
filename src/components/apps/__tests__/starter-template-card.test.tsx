import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StarterTemplateCard } from "../starter-template-card";
import type { StarterTemplate } from "@/lib/apps/starters";

const pushSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy }),
}));

const STARTER: StarterTemplate = {
  id: "weekly-portfolio-check-in",
  name: "Weekly portfolio check-in",
  description: "Summarize portfolio performance every Monday.",
  persona: "individual-investor",
  icon: "trending-up",
  starterPrompt: "Build me a weekly portfolio check-in app.",
  preview: { profiles: 1, blueprints: 1, tables: 1, schedules: 1 },
};

describe("StarterTemplateCard", () => {
  beforeEach(() => {
    pushSpy.mockClear();
    window.sessionStorage.clear();
  });

  it("renders the starter name + description + preview pills", () => {
    render(<StarterTemplateCard starter={STARTER} />);
    expect(screen.getByText("Weekly portfolio check-in")).toBeInTheDocument();
    expect(screen.getByText(/Summarize portfolio performance/i)).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Blueprint")).toBeInTheDocument();
    expect(screen.getByText("1 table")).toBeInTheDocument();
    expect(screen.getByText("Schedule")).toBeInTheDocument();
  });

  it("on click: seeds sessionStorage prefill and routes to /chat", () => {
    render(<StarterTemplateCard starter={STARTER} />);
    fireEvent.click(screen.getByRole("button", { name: /Start Weekly portfolio check-in/ }));
    expect(window.sessionStorage.getItem("chat:prefill:pending")).toBe(STARTER.starterPrompt);
    expect(pushSpy).toHaveBeenCalledWith("/chat");
  });

  it("on Enter key: same behavior as click (keyboard accessible)", () => {
    render(<StarterTemplateCard starter={STARTER} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Start Weekly portfolio check-in/ }), {
      key: "Enter",
    });
    expect(pushSpy).toHaveBeenCalledWith("/chat");
  });

  it("pluralizes preview counts correctly", () => {
    const multi: StarterTemplate = { ...STARTER, preview: { profiles: 2, blueprints: 3, tables: 4, schedules: 0 } };
    render(<StarterTemplateCard starter={multi} />);
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("3 blueprints")).toBeInTheDocument();
    expect(screen.getByText("4 tables")).toBeInTheDocument();
    expect(screen.queryByText(/schedule/i)).toBeNull();
  });

  it("omits preview row when all counts are zero", () => {
    const empty: StarterTemplate = {
      ...STARTER,
      preview: { profiles: 0, blueprints: 0, tables: 0, schedules: 0 },
    };
    render(<StarterTemplateCard starter={empty} />);
    expect(screen.queryByText("Agent")).toBeNull();
    expect(screen.queryByText("Blueprint")).toBeNull();
    expect(screen.queryByText("1 table")).toBeNull();
    expect(screen.queryByText("Schedule")).toBeNull();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
