import {
  relayApiToken,
  relayCellIdOverride,
  relayExposureProfile,
  relayPublicOrigin,
  relayRoutePrefix,
} from "@/lib/config/env";
import type { IngressConfig } from "./policy";

/** 32 characters is 128 bits as hex; `openssl rand -hex 32` gives 64. */
export const MIN_API_TOKEN_LENGTH = 32;

export class RelayIngressConfigError extends Error {
  readonly code = "INGRESS_CONFIG_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "RelayIngressConfigError";
  }
}

export function getIngressConfig(): IngressConfig {
  const profile = relayExposureProfile();
  const originValue = relayPublicOrigin();
  let publicOrigin: URL | undefined;
  if (originValue) {
    try {
      publicOrigin = new URL(originValue);
    } catch {
      throw new RelayIngressConfigError("RELAY_PUBLIC_ORIGIN must be a valid absolute URL.");
    }
  }
  if (profile !== "trusted-local" && !publicOrigin) {
    throw new RelayIngressConfigError("Authenticated exposure requires RELAY_PUBLIC_ORIGIN.");
  }
  if (profile === "remote-authenticated" && publicOrigin?.protocol !== "https:") {
    throw new RelayIngressConfigError("Remote-authenticated exposure requires an https public origin.");
  }
  if (publicOrigin?.username || publicOrigin?.password || publicOrigin?.search || publicOrigin?.hash) {
    throw new RelayIngressConfigError("RELAY_PUBLIC_ORIGIN cannot contain credentials, a query, or a fragment.");
  }
  const apiToken = relayApiToken();
  if (apiToken !== undefined && apiToken.length < MIN_API_TOKEN_LENGTH) {
    throw new RelayIngressConfigError(`RELAY_API_TOKEN must be at least ${MIN_API_TOKEN_LENGTH} characters.`);
  }
  const routePrefix = relayRoutePrefix();
  if (publicOrigin && publicOrigin.pathname !== "/" && publicOrigin.pathname.replace(/\/$/, "") !== routePrefix) {
    throw new RelayIngressConfigError("RELAY_PUBLIC_ORIGIN path must match RELAY_ROUTE_PREFIX.");
  }
  return {
    profile,
    cellId: relayCellIdOverride() || "direct-cell",
    publicOrigin,
    routePrefix,
    apiToken,
  };
}
