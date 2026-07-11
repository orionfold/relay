import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AppPublishError,
  createPublishTarget,
  listPublishTargets,
} from "@/lib/publishers/app-publish";
import {
  connectGitHub,
  getGitHubToken,
  GitHubConnectionError,
} from "@/lib/publishers/github-connection";

const githubName = z.string().min(1).max(100).regex(/^[A-Za-z0-9_.-]+$/);
const githubBranch = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9._/-]+$/)
  .refine((value) => !value.includes("..") && !value.includes("@{") && !value.endsWith(".lock"));
const githubBaseConfig = {
  owner: githubName,
  repo: githubName,
  githubToken: z.string().min(1).max(1000).optional(),
};
const createPublishTargetSchema = z.discriminatedUnion("targetType", [
  z
    .object({
      targetType: z.literal("github-pages"),
      config: z.object({ ...githubBaseConfig, branch: githubBranch.optional() }).strict(),
    })
    .strict(),
  z
    .object({
      targetType: z.literal("github-repo"),
      config: z
        .object({
          ...githubBaseConfig,
          branch: githubBranch.optional(),
          directory: z
            .string()
            .max(500)
            .refine(
              (value) =>
                value === "" ||
                (!value.startsWith("/") &&
                  !value.endsWith("/") &&
                  value.split("/").every((part) => part !== "" && part !== "." && part !== "..")),
              "directory must be a safe repository-relative path"
            )
            .optional(),
        })
        .strict(),
    })
    .strict(),
]);

function errorResponse(err: unknown) {
  if (err instanceof GitHubConnectionError) {
    return NextResponse.json({ error: err.message }, { status: err.statusCode });
  }
  if (err instanceof AppPublishError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode }
    );
  }
  console.error("[apps/publish-targets] route error:", err);
  return NextResponse.json({ error: "Publish target request failed" }, { status: 500 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return NextResponse.json(listPublishTargets(id));
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createPublishTargetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const config = { ...parsed.data.config };
    if (config.githubToken) {
      await connectGitHub(config.githubToken);
      delete config.githubToken;
    } else if (!(await getGitHubToken())) {
      return NextResponse.json(
        { error: "Connect GitHub in Settings before adding a repository." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      createPublishTarget(id, { targetType: parsed.data.targetType, config }),
      { status: 201 }
    );
  } catch (err) {
    return errorResponse(err);
  }
}
