"use client";

import { Badge } from "@/components/ui/badge";
import type { ApiKeySource, AuthMethod } from "@/lib/constants/settings";
import type { RuntimeReadinessPhase } from "@/lib/settings/runtime-readiness";

interface AuthStatusBadgeProps {
  connected: boolean;
  apiKeySource: ApiKeySource;
  authMethod?: AuthMethod | "none";
  oauthLabel?: string;
  oauthConnected?: boolean;
  readiness?: RuntimeReadinessPhase;
}

const sourceLabels: Record<ApiKeySource, string> = {
  db: "Managed API Key",
  env: "Environment Variable",
  oauth: "OAuth",
  unknown: "Unknown",
};

export function AuthStatusBadge({
  connected,
  apiKeySource,
  authMethod,
  oauthLabel = "OAuth",
  oauthConnected,
  readiness,
}: AuthStatusBadgeProps) {
  if (readiness === "saved-unverified") {
    return (
      <Badge variant="outline" className="border-status-warning/50 text-status-warning">
        Saved · not verified
      </Badge>
    );
  }
  if (readiness === "auth-rejected") {
    return (
      <Badge variant="outline" className="border-status-failed/50 text-status-failed">
        Authentication rejected
      </Badge>
    );
  }
  if (readiness === "unreachable") {
    return (
      <Badge variant="outline" className="border-status-failed/50 text-status-failed">
        Unreachable
      </Badge>
    );
  }
  if (readiness === "model-required") {
    return (
      <Badge variant="outline" className="border-status-warning/50 text-status-warning">
        Model required
      </Badge>
    );
  }
  if (readiness === "invalid-response") {
    return (
      <Badge variant="outline" className="border-status-failed/50 text-status-failed">
        Invalid response
      </Badge>
    );
  }
  if (
    readiness === "not-configured" ||
    (!connected && apiKeySource === "unknown")
  ) {
    return (
      <Badge variant="outline" className="border-warning/50 text-warning">
        Not configured
      </Badge>
    );
  }

  if (!connected) {
    return (
      <Badge variant="outline" className="border-status-failed/50 text-status-failed">
        Disconnected
      </Badge>
    );
  }

  if (connected && authMethod === "oauth" && oauthConnected === false) {
    return (
      <Badge variant="outline" className="border-status-warning/50 text-status-warning">
        Direct API only
      </Badge>
    );
  }

  if (connected && authMethod === "oauth" && (oauthConnected ?? true)) {
    return (
      <Badge variant="outline" className="border-success/50 text-success">
        Connected via {oauthLabel}
      </Badge>
    );
  }

  if (apiKeySource === "unknown") {
    return (
      <Badge variant="outline" className="border-success/50 text-success">
        Connected
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-success/50 text-success">
      Connected via {sourceLabels[apiKeySource]}
    </Badge>
  );
}
