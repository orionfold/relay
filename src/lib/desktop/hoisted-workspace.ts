import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { dirname, join } from "path";

export const HOISTED_RUNTIME_INPUTS = [
  "src",
  "public",
  "next.config.mjs",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
  "drizzle.config.ts",
] as const;

const HOISTED_INPUTS_MANIFEST = ".relay-runtime-inputs.json";

interface HoistedInputsManifest {
  schemaVersion: 1;
  packageVersion: string;
  inputs: string[];
}

export class HoistedWorkspaceSyncError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "HoistedWorkspaceSyncError";
  }
}

function readManifest(hoistedRoot: string): HoistedInputsManifest | null {
  try {
    const parsed = JSON.parse(
      readFileSync(join(hoistedRoot, HOISTED_INPUTS_MANIFEST), "utf-8"),
    ) as Partial<HoistedInputsManifest>;
    if (
      parsed.schemaVersion !== 1 ||
      typeof parsed.packageVersion !== "string" ||
      !Array.isArray(parsed.inputs) ||
      parsed.inputs.some((input) => typeof input !== "string")
    ) {
      return null;
    }
    return parsed as HoistedInputsManifest;
  } catch {
    return null;
  }
}

function packageVersionAt(root: string): string | null {
  try {
    const value = JSON.parse(
      readFileSync(join(root, "package.json"), "utf-8"),
    ) as { version?: unknown };
    return typeof value.version === "string" ? value.version : null;
  } catch {
    return null;
  }
}

export function areHoistedWorkspaceInputsCurrent(
  hoistedRoot: string,
  packageVersion: string,
): boolean {
  const manifest = readManifest(hoistedRoot);
  return (
    manifest?.packageVersion === packageVersion &&
    manifest.inputs.length === HOISTED_RUNTIME_INPUTS.length &&
    HOISTED_RUNTIME_INPUTS.every(
      (name, index) => manifest.inputs[index] === name,
    ) &&
    HOISTED_RUNTIME_INPUTS.every((name) => existsSync(join(hoistedRoot, name)))
  );
}

export function syncHoistedWorkspaceInputs({
  appDir,
  hoistedRoot,
  packageVersion,
}: {
  appDir: string;
  hoistedRoot: string;
  packageVersion: string;
}): "already-current" | "synchronized" {
  if (areHoistedWorkspaceInputsCurrent(hoistedRoot, packageVersion)) {
    return "already-current";
  }

  if (packageVersionAt(appDir) !== packageVersion) {
    throw new HoistedWorkspaceSyncError(
      `Relay runtime input version mismatch: package requested ${packageVersion}, package.json at ${appDir} reports ${String(packageVersionAt(appDir))}.`,
    );
  }

  for (const name of HOISTED_RUNTIME_INPUTS) {
    if (!existsSync(join(appDir, name))) {
      throw new HoistedWorkspaceSyncError(
        `Relay ${packageVersion} is missing required runtime input "${name}" at ${join(appDir, name)}. Reinstall the npm package and retry.`,
      );
    }
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const stageRoot = join(hoistedRoot, `.relay-runtime-inputs-stage-${suffix}`);
  const backupRoot = join(hoistedRoot, `.relay-runtime-inputs-backup-${suffix}`);
  const manifestPath = join(hoistedRoot, HOISTED_INPUTS_MANIFEST);
  const manifestTempPath = `${manifestPath}.tmp-${suffix}`;
  const previousManifest = existsSync(manifestPath)
    ? readFileSync(manifestPath, "utf-8")
    : null;
  const touchedInputs = new Set<string>();

  rmSync(stageRoot, { recursive: true, force: true });
  rmSync(backupRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });
  mkdirSync(backupRoot, { recursive: true });

  try {
    for (const name of HOISTED_RUNTIME_INPUTS) {
      cpSync(join(appDir, name), join(stageRoot, name), { recursive: true });
    }

    for (const name of HOISTED_RUNTIME_INPUTS) {
      const destination = join(hoistedRoot, name);
      const backup = join(backupRoot, name);
      if (existsSync(destination)) {
        mkdirSync(dirname(backup), { recursive: true });
        renameSync(destination, backup);
        touchedInputs.add(name);
      }
      renameSync(join(stageRoot, name), destination);
      touchedInputs.add(name);
    }

    const manifest = {
      schemaVersion: 1,
      packageVersion,
      inputs: [...HOISTED_RUNTIME_INPUTS],
    } satisfies HoistedInputsManifest;
    writeFileSync(
      manifestTempPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf-8",
    );
    renameSync(manifestTempPath, manifestPath);
    return "synchronized";
  } catch (cause) {
    for (const name of touchedInputs) {
      const destination = join(hoistedRoot, name);
      const backup = join(backupRoot, name);
      rmSync(destination, { recursive: true, force: true });
      if (existsSync(backup)) {
        renameSync(backup, destination);
      }
    }
    if (previousManifest === null) {
      rmSync(manifestPath, { force: true });
    } else {
      writeFileSync(manifestPath, previousManifest, "utf-8");
    }
    if (cause instanceof HoistedWorkspaceSyncError) {
      throw cause;
    }
    throw new HoistedWorkspaceSyncError(
      `Could not synchronize Relay ${packageVersion} runtime inputs: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
  } finally {
    rmSync(manifestTempPath, { force: true });
    rmSync(stageRoot, { recursive: true, force: true });
    rmSync(backupRoot, { recursive: true, force: true });
  }
}
