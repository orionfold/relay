// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfMark } from "../of-mark";

describe("OfMark", () => {
  it("uses release-bundled static assets instead of runtime public paths", () => {
    render(<OfMark size={40} />);
    const mark = screen.getByRole("img", { name: "Orionfold" });

    expect(mark.getAttribute("src")).not.toMatch(/^\/brand\//);
    expect(mark.getAttribute("srcset")).not.toMatch(/(?:^|, )\/brand\//);
    expect(mark).toHaveAttribute("width", "40");
    expect(mark).toHaveAttribute("height", "40");
  });
});
