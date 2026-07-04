import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { PageShell } from "@/components/shared/page-shell";
import { BlueprintPreview } from "@/components/workflows/blueprint-preview";
import { getBlueprint } from "@/lib/workflows/blueprints/registry";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function BlueprintDetailPage({ params }: Props) {
  const { id } = await params;
  const blueprint = getBlueprint(id);

  if (!blueprint) {
    notFound();
  }

  const allProjects = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .orderBy(projects.name);

  return (
    <PageShell backHref="/blueprints" backLabel="Back to Blueprints">
      <BlueprintPreview blueprint={blueprint} projects={allProjects} />
    </PageShell>
  );
}
