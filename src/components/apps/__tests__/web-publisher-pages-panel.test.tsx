import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WebPublisherPagesPanel } from "../web-publisher-pages-panel";
import type { AppDetail } from "@/lib/apps/registry";

vi.mock("@/lib/apps/web-pages", () => {
  return {
    DEFAULT_WEB_PAGE_SLUG: "home",
    ensureWebPageRegistry: vi.fn(async () => ({
      pagesTableId: "web_pages",
      sectionsTableId: "web_sections",
      pages: [
        {
          rowId: "page-home",
          slug: "home",
          title: "Studio launch page",
          description: "A page ready for review.",
          status: "draft",
          sortOrder: 1,
          updatedAt: new Date("2026-07-08T12:00:00Z"),
        },
      ],
      sections: [
        {
          id: "section-hero",
          tableId: "web_sections",
          data: {
            pageSlug: "home",
            kind: "hero",
            heading: "Studio launch page",
            body: "A page ready for review.",
            order: 1,
            status: "published",
            ctaLabel: "Book",
          },
          updatedAt: new Date("2026-07-08T12:00:00Z"),
        },
      ],
    })),
    createWebPublisherPage: vi.fn(),
    deleteWebPublisherPage: vi.fn(),
    renameWebPublisherPage: vi.fn(),
    filterSectionsForPage: vi.fn((sections, pageSlug) =>
      sections.filter((section: { data: Record<string, unknown> }) => section.data.pageSlug === pageSlug)
    ),
    selectWebPage: vi.fn((registry, pageSlug) =>
      registry.pages.find((page: { slug: string }) => page.slug === pageSlug) ?? registry.pages[0]
    ),
  };
});

vi.mock("@/lib/data/tables", () => ({
  listRows: vi.fn(async () => [
    {
      id: "section-hero",
      tableId: "web_sections",
      data: JSON.stringify({
        pageSlug: "home",
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
      pageSlug: "home",
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
          id: "web_pages",
          columns: ["slug", "title", "description", "status", "sortOrder"],
        },
        {
          id: "web_sections",
          columns: ["pageSlug", "kind", "heading", "body", "order", "status", "ctaLabel"],
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
  it("surfaces registry pages with filters and create affordance", async () => {
    render(await WebPublisherPagesPanel({ app: app(), pageStatus: "all", selectedPageSlug: "home" }));

    expect(screen.getByRole("heading", { name: "Pages" })).toBeInTheDocument();
    expect(screen.getByText("Publisher workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete page" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute(
      "href",
      "/apps/relay-web-publisher?page=home&pageStatus=all"
    );
    expect(screen.getByText("Studio launch page")).toBeInTheDocument();
    expect(screen.getByLabelText("Page title for home")).toHaveValue("Studio launch page");
    expect(screen.getByRole("button", { name: "Save name" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Publish controls" })).toHaveAttribute(
      "href",
      "/apps/relay-web-publisher?page=home#site-publish-panel"
    );
    expect(screen.getByRole("link", { name: "Pages table" })).toHaveAttribute(
      "href",
      "/tables/web_pages"
    );
  });
});
