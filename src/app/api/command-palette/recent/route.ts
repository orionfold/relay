import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  const [recentProjects, recentTasks] = await Promise.all([
    db
      .select({
        id: projects.id,
        name: projects.name,
        status: projects.status,
      })
      .from(projects)
      .orderBy(desc(projects.updatedAt))
      .limit(5),
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
      })
      .from(tasks)
      .orderBy(desc(tasks.updatedAt))
      .limit(5),
  ]);

  return NextResponse.json({
    projects: recentProjects,
    tasks: recentTasks,
  });
}
