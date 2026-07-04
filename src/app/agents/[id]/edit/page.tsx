import { notFound } from "next/navigation";
import { getProfile, isBuiltin } from "@/lib/agents/profiles/registry";
import { PageShell } from "@/components/shared/page-shell";
import { ProfileFormView } from "@/components/profiles/profile-form-view";

export const dynamic = "force-dynamic";

export default async function EditProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { id } = await params;
  const { duplicate } = await searchParams;

  const profile = getProfile(id);
  if (!profile) notFound();

  // Builtins can't be edited, but can be duplicated
  if (isBuiltin(id) && duplicate !== "true") notFound();

  return (
    <PageShell
      backHref={duplicate === "true" ? "/agents" : `/agents/${id}`}
      backLabel={duplicate === "true" ? "Back to Agents" : "Back to Agent"}
    >
      <ProfileFormView profileId={id} duplicate={duplicate === "true"} />
    </PageShell>
  );
}
