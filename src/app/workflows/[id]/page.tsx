import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { workflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageShell } from "@/components/shared/page-shell";
import { WorkflowStatusView } from "@/components/workflows/workflow-status-view";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id));

  if (!workflow) notFound();

  return (
    <PageShell
      backHref="/workflows"
      backLabel="Back to Workflows"
    >
      <WorkflowStatusView workflowId={id} />
    </PageShell>
  );
}
