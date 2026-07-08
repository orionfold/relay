import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WebDesignerShell } from "../web-designer-shell";
import type { AppDetail } from "@/lib/apps/registry";

vi.mock("@/lib/data/tables", () => ({
  listRows: vi.fn(async (tableId: string) => {
    const now = new Date("2026-07-08T14:00:00Z");
    if (tableId === "web_sections") {
      return [
        {
          id: "section-hero",
          tableId,
          data: JSON.stringify({
            kind: "hero",
            heading: "Launch page",
            body: "A focused service page.",
            order: 1,
            status: "published",
            ctaLabel: "Book",
          }),
          position: 0,
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    return [
      {
        id: "asset-proof",
        tableId,
        data: JSON.stringify({
          title: "Proof block",
          summary: "Reusable launch proof.",
          page_role: "trust",
          status: "active",
        }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      },
    ];
  }),
}));

vi.mock("@/lib/publishers/app-publish", () => ({
  listDeployments: vi.fn(() => [
    {
      id: "deployment-success",
      appId: "relay-web-designer",
      targetId: "target-1",
      status: "success",
      url: "https://example.com/relay/",
      finalUrl: "https://example.com/relay/",
      commit: "abc123",
      artifactHash: "hash",
      generatorConfig: "{}",
      startedAt: new Date("2026-07-08T13:00:00Z"),
      finishedAt: new Date("2026-07-08T13:01:00Z"),
      error: null,
    },
  ]),
  listPublishTargets: vi.fn(() => [
    {
      id: "target-1",
      appId: "relay-web-designer",
      targetType: "github-pages",
      config: JSON.stringify({
        owner: "orionfold",
        repo: "relay-web-smoke",
        branch: "gh-pages",
      }),
      createdAt: new Date("2026-07-08T12:00:00Z"),
    },
  ]),
}));

function app(): AppDetail {
  return {
    id: "relay-web-designer",
    name: "Relay Web Designer",
    description: "Manage assets, sections, previews, and publish targets.",
    rootDir: "/tmp/relay-web-designer",
    primitivesSummary: "2 profiles, 2 blueprints, 2 tables",
    profileCount: 2,
    blueprintCount: 2,
    tableCount: 2,
    scheduleCount: 0,
    scheduleHuman: null,
    createdAt: Date.now(),
    files: [],
    entitlement: null,
    manifest: {
      id: "relay-web-designer",
      name: "Relay Web Designer",
      description: "Manage assets, sections, previews, and publish targets.",
      profiles: [],
      blueprints: [],
      schedules: [],
      tables: [
        {
          id: "web_sections",
          columns: ["kind", "heading", "body", "order", "status", "ctaLabel"],
        },
        {
          id: "web_assets",
          columns: ["title", "asset_type", "page_role", "summary", "status"],
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

describe("WebDesignerShell", () => {
  it("renders bundle-level page, asset, and publish status", async () => {
    render(await WebDesignerShell({ app: app(), actions: <button>Run</button> }));

    expect(screen.getByRole("heading", { name: "Relay Web Designer" })).toBeInTheDocument();
    expect(screen.getByText("Bundle workspace")).toBeInTheDocument();
    expect(screen.getAllByText("Pages").length).toBeGreaterThan(0);
    expect(screen.getByText("Asset readiness")).toBeInTheDocument();
    expect(screen.getByText("Publish report")).toBeInTheDocument();
    expect(screen.getByText("Launch page")).toBeInTheDocument();
    expect(screen.getByText("Proof block")).toBeInTheDocument();
    expect(screen.getByText("orionfold/relay-web-smoke:gh-pages")).toBeInTheDocument();
  });
});
