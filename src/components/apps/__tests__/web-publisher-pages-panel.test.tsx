import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WebPublisherPagesPanel } from "../web-publisher-pages-panel";
import type { AppDetail } from "@/lib/apps/registry";

vi.mock("@/lib/data/tables", () => ({
  listRows: vi.fn(async () => [
    {
      id: "section-hero",
      tableId: "web_sections",
      data: JSON.stringify({
        kind: "hero",
        heading: "Studio launch page",
        body: "A page ready for review.",
        order: 1,
        status: "published",
        ctaLabel: "Book",
      }),
      position: 0,
      createdAt: new Date("2026-07-08T12:00:00Z"),
      updatedAt: new Date("2026-07-08T12:00:00Z"),
    },
  ]),
}));

vi.mock("@/lib/publishers/app-publish", () => ({
  listDeployments: vi.fn(() => [
    {
      id: "deployment-success",
      appId: "relay-web-publisher",
      targetId: "target-1",
      status: "success",
      url: "https://example.com/page/",
      finalUrl: "https://example.com/page/",
      commit: "abc123",
      artifactHash: "hash",
      generatorConfig: "{}",
      startedAt: new Date("2026-07-08T13:00:00Z"),
      finishedAt: new Date("2026-07-08T13:01:00Z"),
      error: null,
    },
  ]),
}));

function app(): AppDetail {
  return {
    id: "relay-web-publisher",
    name: "Relay Web Publisher",
    description: "Manage ordered website sections.",
    rootDir: "/tmp/relay-web-publisher",
    primitivesSummary: "1 profile, 1 blueprint, 1 table",
    profileCount: 1,
    blueprintCount: 1,
    tableCount: 1,
    scheduleCount: 0,
    scheduleHuman: null,
    createdAt: Date.now(),
    files: [],
    entitlement: null,
    manifest: {
      id: "relay-web-publisher",
      name: "Relay Web Publisher",
      description: "Manage ordered website sections.",
      profiles: [],
      blueprints: [],
      schedules: [],
      tables: [
        {
          id: "web_sections",
          columns: ["kind", "heading", "body", "order", "status", "ctaLabel"],
        },
      ],
      view: {
        kit: "tracker",
        bindings: {
          generate: {
            generatorType: "static-site",
            table: "web_sections",
            siteTitle: "Studio Launch Page",
          },
          publish: { targetType: "github-pages" },
        },
      },
    },
  };
}

describe("WebPublisherPagesPanel", () => {
  it("surfaces the implicit page with filters and create affordance", async () => {
    render(await WebPublisherPagesPanel({ app: app(), pageStatus: "all" }));

    expect(screen.getByRole("heading", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByText("Publisher workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute(
      "href",
      "/apps/relay-web-publisher?pageStatus=all"
    );
    expect(screen.getByText("Studio launch page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publish controls" })).toHaveAttribute(
      "href",
      "#site-publish-panel"
    );
  });
});
