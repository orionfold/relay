import { notFound } from "next/navigation";
import { getProfile, isBuiltin } from "@/lib/agents/profiles/registry";
import { PageShell } from "@/components/shared/page-shell";
import { ProfileDetailView } from "@/components/profiles/profile-detail-view";

export const dynamic = "force-dynamic";

export default async function ProfileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const profile = getProfile(id);
  if (!profile) notFound();

  return (
    <PageShell backHref="/agents" backLabel="Back to Agents">
      <ProfileDetailView profileId={id} isBuiltin={isBuiltin(id)} initialProfile={profile} />
    </PageShell>
  );
}
