import { listTemplates } from "@/lib/data/tables";
import { PageShell } from "@/components/shared/page-shell";
import { TableTemplateGallery } from "@/components/tables/table-template-gallery";

export const dynamic = "force-dynamic";

export default async function SchemasPage() {
  const templates = await listTemplates();

  return (
    <PageShell
      title="Schemas"
      backHref="/tables"
      backLabel="Tables"
    >
      <TableTemplateGallery templates={templates} />
    </PageShell>
  );
}
