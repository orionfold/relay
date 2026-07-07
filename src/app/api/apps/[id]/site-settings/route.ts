import { NextRequest, NextResponse } from "next/server";
import { getApp } from "@/lib/apps/registry";
import {
  getAppStaticSiteSettings,
  setAppStaticSiteSettings,
} from "@/lib/generators/app-static-site-settings";
import {
  DEFAULT_STATIC_SITE_SETTINGS,
  StaticSiteSettingsError,
} from "@/lib/generators/static-site-settings";
import {
  StaticSiteTemplateError,
  listStaticSiteTemplates,
  staticSiteTemplateSummary,
} from "@/lib/generators/static-site-templates";

function errorResponse(err: unknown) {
  if (err instanceof StaticSiteSettingsError) {
    return NextResponse.json(
      { error: err.message, code: err.code, issues: err.issues },
      { status: 400 }
    );
  }
  if (err instanceof StaticSiteTemplateError) {
    return NextResponse.json(
      { error: err.message, code: err.code, issues: err.issues },
      { status: 400 }
    );
  }
  console.error("[apps/site-settings] error:", err);
  return NextResponse.json(
    { error: "Failed to load static-site settings" },
    { status: 500 }
  );
}

function requireApp(id: string) {
  if (!getApp(id)) {
    return NextResponse.json(
      { error: "App not found", code: "APP_NOT_FOUND" },
      { status: 404 }
    );
  }
  return null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const missing = requireApp(id);
  if (missing) return missing;

  try {
    return NextResponse.json({
      settings: await getAppStaticSiteSettings(id),
      defaults: DEFAULT_STATIC_SITE_SETTINGS,
      templates: listStaticSiteTemplates().map(staticSiteTemplateSummary),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const missing = requireApp(id);
  if (missing) return missing;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "INVALID_JSON" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({
      settings: await setAppStaticSiteSettings(id, body),
      defaults: DEFAULT_STATIC_SITE_SETTINGS,
      templates: listStaticSiteTemplates().map(staticSiteTemplateSummary),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
