import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TableRenderView } from "@/components/tables/table-render-view";
import type { ColumnDef } from "@/lib/tables/types";

const columns: ColumnDef[] = [
  {
    name: "title",
    displayName: "Title",
    dataType: "text",
    position: 0,
    config: { displayRole: "title" },
  },
  {
    name: "description",
    displayName: "Description",
    dataType: "text",
    position: 1,
    config: { displayRole: "description" },
  },
  {
    name: "status",
    displayName: "Status",
    dataType: "select",
    position: 2,
  },
  {
    name: "score",
    displayName: "Score",
    dataType: "number",
    position: 3,
  },
];

describe("TableRenderView", () => {
  it("renders semantic children and opens a row with keyboard activation", () => {
    const onOpenRow = vi.fn();
    render(
      <TableRenderView
        columns={columns}
        rows={[
          {
            id: "row-1",
            data: {
              title: "Campaign brief",
              description: "A bounded abstract",
              status: "Ready",
              score: 8,
            },
          },
        ]}
        selectedRows={new Set()}
        onToggleSelect={vi.fn()}
        onOpenRow={onOpenRow}
      />
    );

    expect(screen.getByText("Campaign brief")).toBeInTheDocument();
    expect(screen.getByText("A bounded abstract")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("No range")).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Open Campaign brief" }), {
      key: "Enter",
    });
    expect(onOpenRow).toHaveBeenCalledWith(
      expect.objectContaining({ id: "row-1" })
    );
  });
});
