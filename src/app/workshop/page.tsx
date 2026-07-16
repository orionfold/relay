import { PageShell } from "@/components/shared/page-shell";
import { WorkshopConsole } from "@/components/workshop/workshop-console";
import { getWorkshopPreflight } from "@/lib/workshop/preflight";
import { getCurrentWorkshopRun } from "@/lib/workshop/runs";

export const dynamic = "force-dynamic";

export default async function WorkshopPage() {
  const [preflight, run] = await Promise.all([
    getWorkshopPreflight(),
    getCurrentWorkshopRun(),
  ]);
  return (
    <PageShell
      title="Relay Operator Workshop"
      description="Turn one operating memo into a governed workflow with restart-safe checkpoints and portable evidence."
    >
      <WorkshopConsole initialPreflight={preflight} initialRun={run} />
    </PageShell>
  );
}
