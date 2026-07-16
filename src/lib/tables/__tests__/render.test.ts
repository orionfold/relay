import { describe, expect, it } from "vitest";
import {
  categoryTone,
  numericPresentation,
  resolveRenderColumns,
  safeThumbnailUrl,
} from "@/lib/tables/render";
import type { ColumnDef } from "@/lib/tables/types";

function column(
  name: string,
  dataType: ColumnDef["dataType"],
  config?: ColumnDef["config"]
): ColumnDef {
  return {
    name,
    displayName: name,
    dataType,
    position: 0,
    config,
  };
}

describe("semantic table render resolver", () => {
  it("honors explicit roles and deterministically selects one title", () => {
    const resolved = resolveRenderColumns([
      column("name", "text"),
      column("headline", "text", { displayRole: "title" }),
      column("notes", "text"),
      column("status", "select"),
    ]);

    expect(resolved.find((entry) => entry.column.name === "headline")?.role).toBe(
      "title"
    );
    expect(resolved.find((entry) => entry.column.name === "name")?.role).toBe(
      "meta"
    );
    expect(resolved.find((entry) => entry.column.name === "notes")?.role).toBe(
      "description"
    );
    expect(resolved.find((entry) => entry.column.name === "status")?.role).toBe(
      "category"
    );
  });

  it("accepts only bounded thumbnail URL schemes", () => {
    expect(safeThumbnailUrl("https://example.com/image.png")).toContain(
      "https://example.com"
    );
    expect(safeThumbnailUrl("http://localhost:3000/image.png")).toContain(
      "http://localhost"
    );
    expect(safeThumbnailUrl("data:image/png;base64,AA")).toBe(
      "data:image/png;base64,AA"
    );
    expect(safeThumbnailUrl("http://example.com/image.png")).toBeNull();
    expect(safeThumbnailUrl("javascript:alert(1)")).toBeNull();
    expect(safeThumbnailUrl("https://user:pass@example.com/image.png")).toBeNull();
  });

  it("keeps category tones stable", () => {
    expect(categoryTone("Qualified")).toBe(categoryTone("Qualified"));
    expect(categoryTone("Qualified")).toBeGreaterThanOrEqual(0);
    expect(categoryTone("Qualified")).toBeLessThan(6);
  });

  it("labels numeric range without inventing equal-range intensity", () => {
    expect(numericPresentation(5, [0, 5, 10]).label).toBe("Mid");
    expect(numericPresentation(-10, [-10, 0, 10]).label).toBe("Low");
    expect(numericPresentation(4, [4]).label).toBe("No range");
    expect(numericPresentation("nope", [1, 2]).normalized).toBeNull();
    expect(
      numericPresentation(25, [0, 100], {
        numberPolarity: "lower",
        numberDomain: { min: 0, max: 50 },
      })
    ).toMatchObject({ label: "Mid", direction: "Lower", normalized: 0.5 });
  });
});
