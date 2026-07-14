import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { projects, workflows } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { PageShell } from "@/components/shared/page-shell";
import { WorkflowFormView } from "@/components/workflows/workflow-form-view";
import { listProfiles } from "@/lib/agents/profiles/registry";
import { parseStoredSuccessCriteria } from "@/lib/operations/criteria";

export const dynamic = "force-dynamic";

export default async function EditWorkflowPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ clone?: string }>;
}) {
  const { id } = await params;
  const { clone } = await searchParams;

  const [workflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.id, id));

  if (!workflow) notFound();

  const allProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);

  const profiles = listProfiles().map((p) => ({
    id: p.id,
    name: p.name,
    supportedRuntimes: p.supportedRuntimes,
    origin: p.origin,
    scope: p.scope,
  }));

  const workflowData = {
    id: workflow.id,
    name: workflow.name,
    projectId: workflow.projectId,
    definition: workflow.definition,
    successCriteria: parseStoredSuccessCriteria(workflow.successCriteria),
  };

  return (
    <PageShell
      backHref={clone === "true" ? "/workflows" : `/workflows/${id}`}
      backLabel={clone === "true" ? "Back to Workflows" : "Back to Workflow"}
    >
      <WorkflowFormView
        workflow={workflowData}
        projects={allProjects}
        profiles={profiles}
        clone={clone === "true"}
      />
    </PageShell>
  );
}
