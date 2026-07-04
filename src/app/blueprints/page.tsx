import { PageShell } from "@/components/shared/page-shell";
import { BlueprintGallery } from "@/components/workflows/blueprint-gallery";

export const dynamic = "force-dynamic";

export default function BlueprintsPage() {
  return (
    <PageShell>
      <BlueprintGallery />
    </PageShell>
  );
}
