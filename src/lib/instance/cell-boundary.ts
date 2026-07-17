import { resolve } from "node:path";
import {
  dataDir,
  dataDirOverride,
  dbPath,
  launchCwd,
  relayCellIdOverride,
} from "@/lib/config/env";
import { hasGitDir, isDevMode } from "./detect";
import { getInstanceConfig } from "./settings";

export const RELAY_CELL_VOCABULARY_VERSION = "relay-host-cell-v1" as const;

export interface RelayCellBoundary {
  vocabularyVersion: typeof RELAY_CELL_VOCABULARY_VERSION;
  instanceId: string | null;
  dataDirectory: string;
  databasePath: string;
  launchWorkingDirectory: string;
  dataDirectorySource: "default" | "override";
}

export interface RelayExecutionContext {
  cell: Pick<RelayCellBoundary, "vocabularyVersion" | "instanceId">;
  projectId: string | null;
  projectName: string | null;
  workingDirectory: string;
  workingDirectorySource: "project" | "launch";
}

export function buildRelayCellBoundary(input: {
  instanceId?: string | null;
  dataDirectory: string;
  databasePath: string;
  launchWorkingDirectory: string;
  dataDirectorySource: "default" | "override";
}): RelayCellBoundary {
  return {
    vocabularyVersion: RELAY_CELL_VOCABULARY_VERSION,
    instanceId: input.instanceId ?? null,
    dataDirectory: resolve(input.dataDirectory),
    databasePath: resolve(input.databasePath),
    launchWorkingDirectory: resolve(input.launchWorkingDirectory),
    dataDirectorySource: input.dataDirectorySource,
  };
}

/**
 * Returns content-safe facts about the active Relay cell. The facts are derived
 * from existing process configuration and are never persisted as a second
 * source of truth.
 *
 * A Host-supplied RELAY_CELL_ID is authoritative for managed Cells, including
 * no-git OCI runtimes. Without that value, dev and ordinary npx installs
 * intentionally report no instance id. Dev mode may have stale bootstrap
 * settings from explicit instance testing, while npx installs do not
 * participate in git-backed instance bootstrap at all.
 */
export function getRelayCellBoundary(): RelayCellBoundary {
  const managedCellId = relayCellIdOverride();
  const instanceId =
    managedCellId ??
    (!isDevMode() && hasGitDir()
      ? getInstanceConfig()?.instanceId ?? null
      : null);

  return buildRelayCellBoundary({
    instanceId,
    dataDirectory: dataDir(),
    databasePath: dbPath(),
    launchWorkingDirectory: launchCwd(),
    dataDirectorySource: dataDirOverride() ? "override" : "default",
  });
}

export function buildRelayExecutionContext(input: {
  cell: RelayCellBoundary;
  project?: {
    id: string;
    name: string;
    workingDirectory: string | null;
  } | null;
}): RelayExecutionContext {
  const projectDirectory = input.project?.workingDirectory?.trim();
  return {
    cell: {
      vocabularyVersion: input.cell.vocabularyVersion,
      instanceId: input.cell.instanceId,
    },
    projectId: input.project?.id ?? null,
    projectName: input.project?.name ?? null,
    workingDirectory: projectDirectory
      ? resolve(projectDirectory)
      : input.cell.launchWorkingDirectory,
    workingDirectorySource: projectDirectory ? "project" : "launch",
  };
}
