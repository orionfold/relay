import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GalleryPreviewView } from "../gallery-preview-view";
import type { GalleryData } from "@/lib/apps/view-kits/types";

function gallery(overrides: Partial<GalleryData> = {}): GalleryData {
  return {
    spec: {
      id: "asset-gallery",
      title: "Assets",
      table: "web_assets",
      titleColumn: "title",
      subtitleColumn: "summary",
      imageUrlColumn: "image_url",
      hrefColumn: "reference_url",
      limit: 12,
    },
    rows: [],
    ...overrides,
  };
}

describe("GalleryPreviewView", () => {
  it("renders a visible empty state", () => {
    render(<GalleryPreviewView gallery={gallery()} />);
    expect(screen.getByText("No gallery items.")).toBeInTheDocument();
  });

  it("renders gallery rows and strips unsafe hrefs", () => {
    render(
      <GalleryPreviewView
        gallery={gallery({
          rows: [
            {
              id: "row-1",
              data: {
                title: "Launch proof",
                summary: "First draft in one week.",
                image_url: "",
                reference_url: "javascript:alert(1)",
              },
            },
          ],
        })}
      />
    );

    expect(screen.getByText("Launch proof")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
