import { NextRequest, NextResponse } from "next/server";
import { listProfiles, listAllProfiles, createProfile, isBuiltin } from "@/lib/agents/profiles/registry";
import { sortProfilesByName } from "@/lib/agents/profiles/sort";
import { ProfileConfigSchema } from "@/lib/validators/profile";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function mapProfileToResponse(p: { id: string; name: string; description: string; domain: string; tags: string[]; skillMd: string; allowedTools?: string[]; mcpServers?: Record<string, unknown>; canUseToolPolicy?: unknown; maxTurns?: number; outputFormat?: string; version?: string; author?: string; source?: string; tests?: unknown; importMeta?: unknown; supportedRuntimes: string[]; runtimeOverrides?: unknown; scope?: string; origin?: string; readOnly?: boolean; projectDir?: string }) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    domain: p.domain,
    tags: p.tags,
    skillMd: p.skillMd,
    allowedTools: p.allowedTools,
    mcpServers: p.mcpServers,
    canUseToolPolicy: p.canUseToolPolicy,
    maxTurns: p.maxTurns,
    outputFormat: p.outputFormat,
    version: p.version,
    author: p.author,
    source: p.source,
    tests: p.tests,
    importMeta: p.importMeta,
    supportedRuntimes: p.supportedRuntimes,
    runtimeOverrides: p.runtimeOverrides,
    isBuiltin: isBuiltin(p.id),
    scope: p.scope ?? (isBuiltin(p.id) ? "builtin" : "user"),
    origin: p.origin ?? (isBuiltin(p.id) ? undefined : "manual"),
    readOnly: p.readOnly ?? false,
  };
}

/**
 * GET /api/agents
 * GET /api/agents?scope=project&projectId=xxx — project-scoped profiles only
 * GET /api/agents?scope=all&projectId=xxx — all scopes (builtin + user + project)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const scope = searchParams.get("scope");
  const projectId = searchParams.get("projectId");

  // Resolve project's workingDirectory if projectId is provided
  let projectDir: string | undefined;
  if (projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    projectDir = project?.workingDirectory ?? undefined;
  }

  if (scope === "project") {
    // Return only project-scoped profiles
    if (!projectDir) {
      return NextResponse.json([]);
    }
    const allProfiles = listAllProfiles(projectDir);
    const projectOnly = allProfiles.filter((p) => p.scope === "project");
    return NextResponse.json(
      sortProfilesByName(projectOnly.map(mapProfileToResponse))
    );
  }

  if (scope === "all" && projectDir) {
    // Return all scopes: builtin + user + project
    const allProfiles = listAllProfiles(projectDir);
    return NextResponse.json(
      sortProfilesByName(allProfiles.map(mapProfileToResponse))
    );
  }

  // Default: user + builtin profiles (backward compatible)
  const profiles = sortProfilesByName(
    listProfiles().map(mapProfileToResponse)
  );

  return NextResponse.json(profiles);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { skillMd, ...configFields } = body;

    const result = ProfileConfigSchema.safeParse(configFields);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues.map((i) => i.message).join(", ") },
        { status: 400 }
      );
    }

    createProfile(result.data, skillMd ?? "");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create profile";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
