import { PageShell } from "@/components/shared/page-shell";
import { BlueprintEditor } from "@/components/workflows/blueprint-editor";

export const dynamic = "force-dynamic";

export default function NewBlueprintPage() {
  return (
    <PageShell backHref="/blueprints" backLabel="Back to Blueprints">
      <BlueprintEditor />
    </PageShell>
  );
}
