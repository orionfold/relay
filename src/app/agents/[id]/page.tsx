import { notFound } from "next/navigation";
import { getProfile, isBuiltin } from "@/lib/agents/profiles/registry";
import { PageShell } from "@/components/shared/page-shell";
import { ProfileDetailView } from "@/components/profiles/profile-detail-view";
import { decodePathId } from "@/lib/routing/primitive-paths";

export const dynamic = "force-dynamic";

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  // A page's route params are not decoded, so a namespaced id arrives escaped.
  const id = decodePathId(rawId);

  const profile = getProfile(id);
  if (!profile) notFound();

  return (
    <PageShell backHref="/agents" backLabel="Back to Agents">
      <ProfileDetailView profileId={id} isBuiltin={isBuiltin(id)} initialProfile={profile} />
    </PageShell>
  );
}
