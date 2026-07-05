import { listProfiles, isBuiltin } from "@/lib/agents/profiles/registry";
import { sortProfilesByName } from "@/lib/agents/profiles/sort";
import { PageShell } from "@/components/shared/page-shell";
import { ProfilePresetGallery } from "@/components/profiles/profile-preset-gallery";

export const dynamic = "force-dynamic";

/**
 * FEAT-13: Presets — the built-in agent starting points, elevated to their own
 * Compose peer of Agents (mirrors Tables → Schemas). The same gallery is also
 * reachable from /agents via "Start from a preset".
 */
export default async function PresetsPage() {
  const presets = sortProfilesByName(
    listProfiles().filter((p) => isBuiltin(p.id))
  );

  return (
    <PageShell
      title="Presets"
      description="Start a new agent from a built-in preset."
      backHref="/agents"
      backLabel="Agents"
    >
      <ProfilePresetGallery presets={presets} />
    </PageShell>
  );
}
