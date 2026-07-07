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
    const { container } = render(
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
    expect(screen.getByRole("link", { name: "Open Launch proof row in table" }))
      .toHaveAttribute("href", "/tables/web_assets?row=row-1");
    expect(screen.queryByRole("link", { name: "Open link" })).not.toBeInTheDocument();
    expect(container.querySelector("[data-testid='gallery-image-frame']")).not.toBeInTheDocument();
  });

  it("renders image thumbnails only when a safe image URL is available", () => {
    const { container } = render(
      <GalleryPreviewView
        gallery={gallery({
          rows: [
            {
              id: "row-1",
              data: {
                title: "Offer block",
                summary: "Comparison section.",
                image_url: "https://example.com/offer.png",
                reference_url: "https://example.com/reference",
              },
            },
          ],
        })}
      />
    );

    expect(container.querySelector("[data-testid='gallery-image-frame']")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/offer.png"
    );
    expect(screen.getByRole("link", { name: "Open link" })).toHaveAttribute(
      "href",
      "https://example.com/reference"
    );
  });
});
