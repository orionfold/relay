import { NextResponse } from "next/server";
import { getTaskRunHistory } from "@/lib/tasks/run-history";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const history = await getTaskRunHistory(id);
  if (!history) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json(history);
}
