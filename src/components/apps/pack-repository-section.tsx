import { PackRepositoryPanel } from "@/components/apps/pack-repository-panel";
import type { AppOrigin } from "@/lib/apps/registry";

export function PackRepositorySection({
  appId,
  origin,
}: {
  appId: string;
  origin: AppOrigin;
}) {
  if (origin !== "user-created") return null;

  return (
    <div
      id="pack-repository-panel"
      className="scroll-mt-[calc(var(--chrome-header)+1rem)]"
    >
      <PackRepositoryPanel appId={appId} />
    </div>
  );
}
