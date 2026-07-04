import { listProfiles, isBuiltin } from "@/lib/agents/profiles/registry";
import { sortProfilesByName } from "@/lib/agents/profiles/sort";
import { listApps } from "@/lib/apps/registry";
import { ProfileBrowser } from "@/components/profiles/profile-browser";
import { PageShell } from "@/components/shared/page-shell";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const profiles = sortProfilesByName(
    listProfiles().map((p) => ({
      ...p,
      isBuiltin: isBuiltin(p.id),
    }))
  );

  // Installed packs — the source-of-truth set the client resolves each
  // profile's pack provenance against (FEAT-8 pill / FEAT-7 filter via
  // packOf). Just {id, name}; the pill renders the name, packOf gates on the id.
  const installedPacks = listApps().map((a) => ({ id: a.id, name: a.name }));

  return (
    <PageShell
      title="Profiles"
      description="Browse and inspect agent profiles without blur-heavy detail surfaces."
    >
      <ProfileBrowser initialProfiles={profiles} installedPacks={installedPacks} />
    </PageShell>
  );
}
