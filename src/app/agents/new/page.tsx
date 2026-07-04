import { PageShell } from "@/components/shared/page-shell";
import { ProfileFormView } from "@/components/profiles/profile-form-view";

export const dynamic = "force-dynamic";

export default async function NewProfilePage() {
  return (
    <PageShell backHref="/agents" backLabel="Back to Agents">
      <ProfileFormView />
    </PageShell>
  );
}
