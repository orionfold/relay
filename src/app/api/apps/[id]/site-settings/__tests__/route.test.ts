import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/apps/registry", () => ({
  getApp: vi.fn(),
}));

vi.mock("@/lib/generators/app-static-site-settings", () => ({
  getAppStaticSiteSettings: vi.fn(),
  setAppStaticSiteSettings: vi.fn(),
}));

vi.mock("@/lib/generators/static-site-templates", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/generators/static-site-templates")
  >("@/lib/generators/static-site-templates");
  return {
    ...actual,
    listStaticSiteTemplates: vi.fn(() => [actual.getStaticSiteTemplate("relay-default")]),
  };
});

import { GET, PUT } from "../route";
import { getApp } from "@/lib/apps/registry";
import {
  getAppStaticSiteSettings,
  setAppStaticSiteSettings,
} from "@/lib/generators/app-static-site-settings";
import { DEFAULT_STATIC_SITE_SETTINGS } from "@/lib/generators/static-site-settings";

function req(body?: unknown) {
  return new NextRequest("http://localhost/api/apps/app-1/site-settings", {
    method: body === undefined ? "GET" : "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("/api/apps/[id]/site-settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getApp).mockReturnValue({ id: "app-1" } as never);
  });

  it("returns defaulted settings for an app", async () => {
    vi.mocked(getAppStaticSiteSettings).mockResolvedValue(DEFAULT_STATIC_SITE_SETTINGS);

    const res = await GET(req(), { params: Promise.resolve({ id: "app-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      settings: DEFAULT_STATIC_SITE_SETTINGS,
      defaults: DEFAULT_STATIC_SITE_SETTINGS,
      templates: [
        expect.objectContaining({
          id: "relay-default",
          provenance: expect.objectContaining({ synthetic: true }),
        }),
      ],
    });
    expect(getAppStaticSiteSettings).toHaveBeenCalledWith("app-1");
  });

  it("saves validated static-site settings", async () => {
    const settings = {
      theme: "contrast",
      density: "compact",
      heroLayout: "stacked",
      accent: "indigo",
      showCtas: false,
      sectionStyle: "ruled",
    } as const;
    vi.mocked(setAppStaticSiteSettings).mockResolvedValue(settings);

    const res = await PUT(req(settings), { params: Promise.resolve({ id: "app-1" }) });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      settings,
      defaults: DEFAULT_STATIC_SITE_SETTINGS,
      templates: [
        expect.objectContaining({
          id: "relay-default",
          provenance: expect.objectContaining({ synthetic: true }),
        }),
      ],
    });
    expect(setAppStaticSiteSettings).toHaveBeenCalledWith("app-1", settings);
  });

  it("returns named validation errors for invalid settings", async () => {
    vi.mocked(setAppStaticSiteSettings).mockImplementation(async (_appId, input) => {
      const { parseStaticSiteSettings } = await import(
        "@/lib/generators/static-site-settings"
      );
      return parseStaticSiteSettings(input);
    });

    const res = await PUT(
      req({ ...DEFAULT_STATIC_SITE_SETTINGS, accent: "ultraviolet" }),
      { params: Promise.resolve({ id: "app-1" }) }
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "STATIC_SITE_SETTINGS_INVALID",
      error: expect.stringContaining("accent"),
    });
  });

  it("returns APP_NOT_FOUND for unknown apps", async () => {
    vi.mocked(getApp).mockReturnValue(null);

    const res = await GET(req(), { params: Promise.resolve({ id: "missing" }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: "App not found",
      code: "APP_NOT_FOUND",
    });
  });
});
