import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TableListTable } from "../table-list-table";
import type { TableWithRelations } from "../types";

const table: TableWithRelations = {
  id: "customers",
  projectId: "project-1",
  name: "Customers",
  description: "Customer records",
  columnSchema: "[]",
  rowCount: 12,
  source: "manual",
  templateId: null,
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-14T00:00:00.000Z"),
  projectName: "Relay",
  columnCount: 4,
};

describe("TableListTable interaction treatment", () => {
  it("highlights body rows without changing row or nested-checkbox callbacks", () => {
    const onToggleSelect = vi.fn();
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const { container } = render(
      <TableListTable
        tables={[table]}
        selected={new Set([table.id])}
        onToggleSelect={onToggleSelect}
        onToggleSelectAll={vi.fn()}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );

    const bodyRow = container.querySelector("tbody tr");
    expect(bodyRow).not.toBeNull();
    expect(bodyRow).toHaveClass("interactive-list-item");
    expect(bodyRow).toHaveAttribute("data-interactive-surface", "");
    expect(bodyRow).toHaveAttribute("data-interactive-outline", "preserve");

    fireEvent.click(bodyRow!);
    expect(onSelect).toHaveBeenCalledWith(table.id);

    onSelect.mockClear();
    const rowCheckbox = screen.getAllByRole("checkbox")[1];
    expect(rowCheckbox).toBeChecked();
    fireEvent.click(rowCheckbox);
    expect(onToggleSelect).toHaveBeenCalledWith(table.id);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.doubleClick(bodyRow!);
    expect(onOpen).toHaveBeenCalledWith(table.id);
  });
});
