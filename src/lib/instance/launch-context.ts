export interface RelayLaunchContext {
  schemaVersion: 1;
  packageVersion: string;
  dataDir: string;
  hostRoot: string | null;
  npmCache: string | null;
  port: number;
  hostname: string;
  exposureProfile:
    | "trusted-local"
    | "private-authenticated"
    | "remote-authenticated";
  publicOrigin: string | null;
  routePrefix: string;
  safeMode: boolean;
  noOpen: boolean;
}

export function serializeRelayLaunchContext(
  context: RelayLaunchContext,
): string {
  return JSON.stringify(context);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function parseRelayLaunchContext(
  raw: string | null | undefined,
): RelayLaunchContext | null {
  if (!raw || raw.length > 16_384) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const exposureProfile = nonEmptyString(value.exposureProfile);
    if (
      value.schemaVersion !== 1 ||
      !nonEmptyString(value.packageVersion) ||
      !nonEmptyString(value.dataDir) ||
      !Number.isInteger(value.port) ||
      (value.port as number) < 1 ||
      (value.port as number) > 65_535 ||
      !nonEmptyString(value.hostname) ||
      !["trusted-local", "private-authenticated", "remote-authenticated"].includes(
        exposureProfile ?? "",
      ) ||
      !nonEmptyString(value.routePrefix) ||
      typeof value.safeMode !== "boolean" ||
      typeof value.noOpen !== "boolean"
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      packageVersion: value.packageVersion as string,
      dataDir: value.dataDir as string,
      hostRoot: nonEmptyString(value.hostRoot),
      npmCache: nonEmptyString(value.npmCache),
      port: value.port as number,
      hostname: value.hostname as string,
      exposureProfile: exposureProfile as RelayLaunchContext["exposureProfile"],
      publicOrigin: nonEmptyString(value.publicOrigin),
      routePrefix: value.routePrefix as string,
      safeMode: value.safeMode,
      noOpen: value.noOpen,
    };
  } catch {
    return null;
  }
}

function quoteShellArg(value: string): string {
  return `'${value.replaceAll("'", `'\"'\"'`)}'`;
}

export function buildRelayUpgradeCommand(context: RelayLaunchContext): string {
  const environment: string[] = [];
  if (context.hostRoot) {
    environment.push(`RELAY_HOST_ROOT=${quoteShellArg(context.hostRoot)}`);
  }
  if (context.npmCache) {
    environment.push(`NPM_CONFIG_CACHE=${quoteShellArg(context.npmCache)}`);
  }

  const args = [
    "npx",
    "--yes",
    "orionfold-relay@latest",
    "--data-dir",
    quoteShellArg(context.dataDir),
    "--port",
    String(context.port),
    "--hostname",
    quoteShellArg(context.hostname),
    "--exposure-profile",
    quoteShellArg(context.exposureProfile),
    "--route-prefix",
    quoteShellArg(context.routePrefix),
  ];
  if (context.publicOrigin) {
    args.push("--public-origin", quoteShellArg(context.publicOrigin));
  }
  if (context.safeMode) {
    args.push("--safe-mode");
  }
  if (context.noOpen) {
    args.push("--no-open");
  }
  return [...environment, ...args].join(" ");
}
