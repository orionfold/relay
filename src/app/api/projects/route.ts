import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { eq, count, sql } from "drizzle-orm";
import { createProjectSchema } from "@/lib/validators/project";
import { scanEnvironment } from "@/lib/environment/scanner";
import { createScan } from "@/lib/environment/data";
import { customerReferenceExists } from "@/lib/data/reference-validation";

export async function GET() {
  const result = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      workingDirectory: projects.workingDirectory,
      customerId: projects.customerId,
      status: projects.status,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      taskCount: count(tasks.id),
      docCount: sql<number>`(SELECT COUNT(*) FROM documents d WHERE d.project_id = "projects"."id")`.as("docCount"),
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .groupBy(projects.id)
    .orderBy(projects.createdAt);

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (
    parsed.data.customerId &&
    !(await customerReferenceExists(parsed.data.customerId))
  ) {
    return NextResponse.json(
      { error: `Customer not found: ${parsed.data.customerId}` },
      { status: 404 }
    );
  }

  const now = new Date();
  const id = crypto.randomUUID();

  await db.insert(projects).values({
    id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    workingDirectory: parsed.data.workingDirectory ?? null,
    customerId: parsed.data.customerId ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id));

  // Auto-scan environment if workingDirectory is set
  if (parsed.data.workingDirectory) {
    try {
      const scanResult = scanEnvironment({
        projectDir: parsed.data.workingDirectory,
      });
      createScan(scanResult, parsed.data.workingDirectory, id);
    } catch {
      // Scan failure shouldn't block project creation
    }
  }

  return NextResponse.json(project, { status: 201 });
}
