import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PackPill } from "@/components/shared/pack-pill";

describe("PackPill", () => {
  it("renders the pack display name", () => {
    render(<PackPill packName="Relay Agency" />);
    expect(screen.getByText("Relay Agency")).toBeInTheDocument();
  });

  it("marks the pill as pack provenance for a11y/testing hooks", () => {
    render(<PackPill packName="Relay Agency Pro" />);
    const pill = screen.getByTestId("pack-pill");
    expect(pill).toHaveTextContent("Relay Agency Pro");
  });

  it("forwards an extra className", () => {
    render(<PackPill packName="X" className="ml-2" />);
    expect(screen.getByTestId("pack-pill").className).toContain("ml-2");
  });
});
