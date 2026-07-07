import { render, screen } from "@testing-library/react";
import { PackCompositionStrip } from "@/components/apps/pack-composition-strip";
import type { AppManifest } from "@/lib/apps/registry";

function manifest(overrides: Partial<AppManifest> = {}): AppManifest {
  return {
    id: "relay-web-designer",
    name: "Relay Web Designer",
    profiles: [{ id: "site-editor" }],
    blueprints: [{ id: "section-draft" }],
    tables: [
      {
        id: "web_sections",
        columns: ["title", "section_type", "body"],
      },
      {
        id: "web_assets",
        columns: ["title", "page_role"],
      },
    ],
    schedules: [{ id: "weekly-refresh", cron: "0 9 * * 1" }],
    ...overrides,
  } as AppManifest;
}

describe("PackCompositionStrip", () => {
  it("summarizes pack primitives and links owned tables", () => {
    render(<PackCompositionStrip manifest={manifest()} />);

    expect(screen.getByText("Pack composition")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Workflows")).toBeInTheDocument();
    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(screen.getByText("Schedules")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /web_sections/i })).toHaveAttribute(
      "href",
      "/tables/web_sections"
    );
    expect(screen.getByRole("link", { name: /web_assets/i })).toHaveAttribute(
      "href",
      "/tables/web_assets"
    );
    expect(screen.getByText("title, section_type, body")).toBeInTheDocument();
  });

  it("omits the table disclosure when the pack owns no tables", () => {
    render(<PackCompositionStrip manifest={manifest({ tables: [] })} />);

    expect(screen.queryByText(/Owned tables/i)).toBeNull();
    expect(screen.getByText("Pack composition")).toBeInTheDocument();
  });
});
