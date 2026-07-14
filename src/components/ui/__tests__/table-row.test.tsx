import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Table, TableBody, TableCell, TableRow } from "../table";

describe("TableRow interaction classification", () => {
  it("keeps static rows inert", () => {
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow className="custom-row">
            <TableCell>Static</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const row = container.querySelector("tbody tr");
    expect(row).toHaveClass("custom-row");
    expect(row).not.toHaveClass("interactive-list-item");
    expect(row).not.toHaveAttribute("data-interactive-surface");
    expect(row).not.toHaveAttribute("data-interactive-outline");
  });

  it("gives clickable rows the shared fill-only contract and preserves callbacks", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Table>
        <TableBody>
          <TableRow className="custom-row" onClick={onClick}>
            <TableCell>Interactive</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const row = container.querySelector("tbody tr");
    expect(row).toHaveClass("interactive-list-item", "custom-row");
    expect(row).toHaveAttribute("data-interactive-surface", "");
    expect(row).toHaveAttribute("data-interactive-outline", "preserve");

    fireEvent.click(row!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
