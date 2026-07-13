import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpandableResult } from "../step-result";

describe("ExpandableResult", () => {
  it("expands long embedded markdown into the taller reading area", () => {
    render(<ExpandableResult result={`# Result\n\n${"Long output. ".repeat(30)}`} />);
    const button = screen.getByRole("button", { name: "Show more" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { level: 3, name: "Result" })).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Show less" }).previousElementSibling).toHaveClass(
      "max-h-[48rem]",
    );
  });
});
