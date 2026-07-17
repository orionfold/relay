import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { dataDir } from "@/lib/config/env";
import { RelayRecoveryError } from "./errors";
import { RECOVERY_KEY_BYTES } from "./types";

function isWithin(parent: string, candidate: string): boolean {
  const rel = relative(resolve(parent), resolve(candidate));
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`));
}

export function createRecoveryKeyFile(path: string): { path: string; fingerprint: string } {
  const resolved = resolve(path);
  if (isWithin(dataDir(), resolved)) {
    throw new RelayRecoveryError("RECOVERY_KEY_INSIDE_CELL", "Recovery key must be stored outside the Relay Cell data directory.");
  }
  if (existsSync(resolved)) {
    throw new RelayRecoveryError("RECOVERY_KEY_EXISTS", "Refusing to replace an existing recovery key file.", 409);
  }
  mkdirSync(dirname(resolved), { recursive: true, mode: 0o700 });
  const actualCandidate = join(realpathSync(dirname(resolved)), basename(resolved));
  const cellRoot = existsSync(dataDir()) ? realpathSync(dataDir()) : resolve(dataDir());
  if (isWithin(cellRoot, actualCandidate)) {
    throw new RelayRecoveryError("RECOVERY_KEY_INSIDE_CELL", "Recovery key must be stored outside the Relay Cell data directory.");
  }
  const key = randomBytes(RECOVERY_KEY_BYTES);
  writeFileSync(resolved, key, { flag: "wx", mode: 0o600 });
  chmodSync(resolved, 0o600);
  return { path: resolved, fingerprint: recoveryKeyFingerprint(key) };
}

export function readRecoveryKeyFile(path: string, destination?: string): Buffer {
  const resolved = resolve(path);
  if (isWithin(dataDir(), resolved)) {
    throw new RelayRecoveryError("RECOVERY_KEY_INSIDE_CELL", "Recovery key must be stored outside the Relay Cell data directory.");
  }
  if (destination && isWithin(destination, resolved)) {
    throw new RelayRecoveryError("RECOVERY_KEY_BESIDE_BUNDLE", "Recovery key must not be stored inside the recovery destination.");
  }
  let stat;
  try {
    stat = lstatSync(resolved);
  } catch (error) {
    throw new RelayRecoveryError("RECOVERY_KEY_NOT_FOUND", "Recovery key file was not found.", 400, { cause: error });
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new RelayRecoveryError("RECOVERY_KEY_FILE_INVALID", "Recovery key path must be a regular file, not a link.");
  }
  const actualKey = realpathSync(resolved);
  const cellRoot = existsSync(dataDir()) ? realpathSync(dataDir()) : resolve(dataDir());
  if (isWithin(cellRoot, actualKey)) {
    throw new RelayRecoveryError("RECOVERY_KEY_INSIDE_CELL", "Recovery key must be stored outside the Relay Cell data directory.");
  }
  if (destination && existsSync(destination) && isWithin(realpathSync(destination), actualKey)) {
    throw new RelayRecoveryError("RECOVERY_KEY_BESIDE_BUNDLE", "Recovery key must not be stored inside the recovery destination.");
  }
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) {
    throw new RelayRecoveryError("RECOVERY_KEY_PERMISSIONS_UNSAFE", "Recovery key file must be owner-only (mode 0600).");
  }
  const key = readFileSync(resolved);
  if (key.length !== RECOVERY_KEY_BYTES) {
    throw new RelayRecoveryError("RECOVERY_KEY_LENGTH_INVALID", `Recovery key must be exactly ${RECOVERY_KEY_BYTES} bytes.`);
  }
  return key;
}

export function recoveryKeyFingerprint(key: Buffer): string {
  return createHash("sha256").update("relay-recovery-key-v1\0").update(key).digest("hex").slice(0, 16);
}

export function recoveryConfiguration(): {
  destinationConfigured: boolean;
  keyConfigured: boolean;
  destinationSource: "environment" | "none";
  keySource: "environment" | "none";
} {
  return {
    destinationConfigured: Boolean(process.env.RELAY_RECOVERY_DESTINATION),
    keyConfigured: Boolean(process.env.RELAY_RECOVERY_KEY_FILE),
    destinationSource: process.env.RELAY_RECOVERY_DESTINATION ? "environment" : "none",
    keySource: process.env.RELAY_RECOVERY_KEY_FILE ? "environment" : "none",
  };
}
