import { access } from "node:fs/promises";
import { constants } from "node:fs";
import semver from "semver";
import { dataDir } from "@/lib/config/env";
import { relayCoreVersion } from "@/lib/packs/install";
import { getRuntimeSetupStates } from "@/lib/settings/runtime-setup";
import {
  BUILTIN_WORKSHOP_EDITION,
  WORKSHOP_STARTER_HASH,
} from "@/lib/workshop/builtin";
import { verifyWorkshopEdition } from "@/lib/workshop/schema";

export interface WorkshopPreflight {
  ready: boolean;
  editionId: string;
  editionVersion: string;
  editionHash: string;
  relay: {
    version: string;
    range: string;
    compatible: boolean;
  };
  dataDirectory: {
    pathLabel: string;
    writable: boolean;
  };
  runtime: {
    configured: Array<{ id: string; label: string }>;
    deterministicFallback: boolean;
  };
  fixture: {
    family: string;
    hash: string;
    intact: boolean;
  };
  failures: Array<{ code: string; message: string; recovery: string }>;
}

export async function getWorkshopPreflight(): Promise<WorkshopPreflight> {
  const edition = verifyWorkshopEdition(BUILTIN_WORKSHOP_EDITION, {
    allowUnsignedHash: BUILTIN_WORKSHOP_EDITION.contentHash,
  });
  const version = relayCoreVersion();
  const compatible = semver.valid(version)
    ? semver.satisfies(version, edition.relayRange)
    : false;
  let writable = false;
  try {
    await access(dataDir(), constants.R_OK | constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  const setup = await getRuntimeSetupStates();
  const configured = Object.values(setup)
    .filter((state) => state.configured)
    .map((state) => ({ id: state.runtimeId, label: state.label }));
  const intact = edition.fixture.sourceHash === WORKSHOP_STARTER_HASH;
  const failures: WorkshopPreflight["failures"] = [];
  if (!compatible) {
    failures.push({
      code: "relay_version_incompatible",
      message: `Relay ${version} is outside ${edition.relayRange}.`,
      recovery: "Use the workshop edition that matches this Relay release.",
    });
  }
  if (!writable) {
    failures.push({
      code: "data_dir_unavailable",
      message: "Relay's data directory is not writable.",
      recovery: "Start Relay with a writable isolated RELAY_DATA_DIR.",
    });
  }
  if (!intact) {
    failures.push({
      code: "integrity_failed",
      message: "The built-in starter does not match the edition.",
      recovery: "Reinstall this Relay release before starting the workshop.",
    });
  }
  return {
    ready: failures.length === 0,
    editionId: edition.id,
    editionVersion: edition.editionVersion,
    editionHash: edition.contentHash,
    relay: { version, range: edition.relayRange, compatible },
    dataDirectory: {
      pathLabel: process.env.RELAY_DATA_DIR ? "isolated RELAY_DATA_DIR" : "default local Relay data",
      writable,
    },
    runtime: {
      configured,
      deterministicFallback: edition.capabilities.deterministicFallback,
    },
    fixture: {
      family: edition.fixture.family,
      hash: WORKSHOP_STARTER_HASH,
      intact,
    },
    failures,
  };
}
