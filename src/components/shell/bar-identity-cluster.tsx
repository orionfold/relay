"use client";

import { AuthStatusDot } from "@/components/settings/auth-status-dot";
import { useInstanceIdentity } from "./use-instance-identity";

// The static instance-identity signals for the app-bar right cluster, ordered
// static→live: version pill · license tag · labeled auth dot. This is the
// bar-side half of the rail-vs-bar semantic split — the BAR carries static
// instance identity; the RAIL carries live operations.
//
// Shadow-path discipline (Engineering Principle #3):
//   - version pill is OMITTED entirely when version is null (the route already
//     maps the "0.0.0" build-fallback to null — absent > wrong).
//   - license tag renders "Community Edition" on the community branch; it can
//     never render a dangling "Licensed to " because licenseTag is a union.
//   - on the hook's error/loading state, the version + license signals render
//     nothing (no skeleton flash). The auth dot is INDEPENDENT (its own
//     /api/settings poll) so connectivity still shows even if identity fails.
export function BarIdentityCluster() {
  const identity = useInstanceIdentity();

  const version = identity.status === "loading" ? null : identity.version;
  const licenseTag =
    identity.status === "loading" ? null : identity.licenseTag;

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      {version && (
        <span
          className="hidden font-mono text-[11px] text-muted-foreground sm:inline"
          title={`relay-core ${version}`}
        >
          v{version}
        </span>
      )}
      {licenseTag && (
        <span className="hidden text-xs text-muted-foreground md:inline">
          {licenseTag.kind === "licensed"
            ? licenseTag.label
            : "Community Edition"}
        </span>
      )}
      <span className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
        <AuthStatusDot showLabel />
      </span>
    </div>
  );
}
