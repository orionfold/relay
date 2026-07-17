import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import * as tar from "tar";
import { RelayRecoveryError } from "./errors";
import {
  RECOVERY_HEADER_MAX_BYTES,
  RECOVERY_IV_BYTES,
  RECOVERY_MAGIC,
  RECOVERY_TAG_BYTES,
  recoveryHeaderSchema,
  recoveryPayloadSchema,
  type RecoveryHeader,
  type RecoveryPayload,
  type VerifiedRecovery,
} from "./types";
import { readRecoveryKeyFile, recoveryKeyFingerprint } from "./key";
import { readAndVerifySnapshotManifest, SnapshotIntegrityError } from "@/lib/snapshots/snapshot-manager";

const PAYLOAD_ENTRIES = new Set([
  "snapshot",
  "payload.json",
  "secret-root.bin",
  "snapshot/manifest.json",
  "snapshot/snapshot.db",
  "snapshot/files.tar.gz",
  "snapshot/auth.db",
]);
const PAYLOAD_CREATE_ENTRIES = ["payload.json", "secret-root.bin", "snapshot"] as const;

function sha256File(path: string): string {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes = 0;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
  } finally {
    closeSync(fd);
  }
  return hash.digest("hex");
}

function ensureSafeEntry(path: string, entryType?: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (!PAYLOAD_ENTRIES.has(normalized)) {
    throw new RelayRecoveryError("RECOVERY_ARCHIVE_ENTRY_REFUSED", `Recovery payload contains an unexpected entry: ${normalized}`);
  }
  if (entryType && !["File", "OldFile", "ContiguousFile", "Directory"].includes(entryType)) {
    throw new RelayRecoveryError("RECOVERY_ARCHIVE_ENTRY_REFUSED", `Recovery payload contains an unsafe ${entryType} entry: ${normalized}`);
  }
  return true;
}

function copyIntoFd(source: string, destinationFd: number): void {
  const sourceFd = openSync(source, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytes = 0;
    while ((bytes = readSync(sourceFd, buffer, 0, buffer.length, null)) > 0) {
      let offset = 0;
      while (offset < bytes) offset += writeSync(destinationFd, buffer, offset, bytes - offset);
    }
  } finally {
    closeSync(sourceFd);
  }
}

export async function encryptRecoveryPayload(input: {
  payloadDir: string;
  destination: string;
  header: Omit<RecoveryHeader, "iv">;
  keyFile: string;
}): Promise<{ candidatePath: string; finalBundlePath: string; bundleSha256: string; keyFingerprint: string; header: RecoveryHeader }> {
  const destination = resolve(input.destination);
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  const key = readRecoveryKeyFile(input.keyFile, destination);
  const iv = randomBytes(RECOVERY_IV_BYTES);
  const header = recoveryHeaderSchema.parse({ ...input.header, iv: iv.toString("base64url") });
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const headerLength = Buffer.allocUnsafe(4);
  headerLength.writeUInt32BE(headerBytes.length);
  const prefix = Buffer.concat([RECOVERY_MAGIC, headerLength, headerBytes]);
  const base = `relay-${header.cellId}-${header.createdAt.replace(/[:.]/g, "-")}-${header.snapshotId}.relay-recovery`;
  const finalBundlePath = join(destination, base);
  const candidatePath = `${finalBundlePath}.candidate-${randomUUID()}`;
  const partialPath = `${candidatePath}.partial-${randomUUID()}`;
  const tempCipher = join(tmpdir(), `.relay-recovery-cipher-${randomUUID()}`);

  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: RECOVERY_TAG_BYTES });
    cipher.setAAD(headerBytes);
    const archive = tar.create(
      { cwd: input.payloadDir, gzip: true, portable: true, noMtime: true },
      PAYLOAD_CREATE_ENTRIES.filter((entry) => existsSync(join(input.payloadDir, entry))),
    );
    await pipeline(archive, cipher, createWriteStream(tempCipher, { flags: "wx", mode: 0o600 }));
    const tag = cipher.getAuthTag();

    const fd = openSync(partialPath, "wx", 0o600);
    try {
      writeSync(fd, prefix);
      copyIntoFd(tempCipher, fd);
      writeSync(fd, tag);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    chmodSync(partialPath, 0o600);
    renameSync(partialPath, candidatePath);
    return {
      candidatePath,
      finalBundlePath,
      bundleSha256: sha256File(candidatePath),
      keyFingerprint: recoveryKeyFingerprint(key),
      header,
    };
  } catch (error) {
    if (error instanceof RelayRecoveryError) throw error;
    throw new RelayRecoveryError("RECOVERY_ENCRYPTION_FAILED", "Recovery bundle encryption failed.", 500, { cause: error });
  } finally {
    rmSync(partialPath, { force: true });
    rmSync(tempCipher, { force: true });
  }
}

function readHeader(bundlePath: string): { header: RecoveryHeader; headerBytes: Buffer; ciphertextStart: number; tag: Buffer } {
  const size = statSync(bundlePath).size;
  if (size < RECOVERY_MAGIC.length + 4 + RECOVERY_TAG_BYTES + 1) {
    throw new RelayRecoveryError("RECOVERY_BUNDLE_TRUNCATED", "Recovery bundle is truncated.");
  }
  const fd = openSync(bundlePath, "r");
  try {
    const magic = Buffer.alloc(RECOVERY_MAGIC.length);
    readSync(fd, magic, 0, magic.length, 0);
    if (!magic.equals(RECOVERY_MAGIC)) throw new RelayRecoveryError("RECOVERY_FORMAT_UNSUPPORTED", "Recovery bundle magic is not supported.");
    const lengthBytes = Buffer.alloc(4);
    readSync(fd, lengthBytes, 0, 4, RECOVERY_MAGIC.length);
    const length = lengthBytes.readUInt32BE();
    if (length < 2 || length > RECOVERY_HEADER_MAX_BYTES) throw new RelayRecoveryError("RECOVERY_HEADER_INVALID", "Recovery bundle header length is invalid.");
    const ciphertextStart = RECOVERY_MAGIC.length + 4 + length;
    if (ciphertextStart + RECOVERY_TAG_BYTES >= size) throw new RelayRecoveryError("RECOVERY_BUNDLE_TRUNCATED", "Recovery bundle has no ciphertext.");
    const headerBytes = Buffer.alloc(length);
    readSync(fd, headerBytes, 0, length, RECOVERY_MAGIC.length + 4);
    let parsed: unknown;
    try { parsed = JSON.parse(headerBytes.toString("utf8")); } catch { throw new RelayRecoveryError("RECOVERY_HEADER_INVALID", "Recovery bundle header is invalid JSON."); }
    const result = recoveryHeaderSchema.safeParse(parsed);
    if (!result.success) throw new RelayRecoveryError("RECOVERY_HEADER_INVALID", "Recovery bundle header does not match the supported schema.");
    const tag = Buffer.alloc(RECOVERY_TAG_BYTES);
    readSync(fd, tag, 0, tag.length, size - tag.length);
    return { header: result.data, headerBytes, ciphertextStart, tag };
  } finally {
    closeSync(fd);
  }
}

function assertRelayCompatibility(sourceVersion: string, currentVersion: string): void {
  const sourceMajor = Number.parseInt(sourceVersion.split(".")[0], 10);
  const currentMajor = Number.parseInt(currentVersion.split(".")[0], 10);
  if (!Number.isFinite(sourceMajor) || !Number.isFinite(currentMajor) || sourceMajor > currentMajor) {
    throw new RelayRecoveryError("RECOVERY_RELAY_VERSION_UNSUPPORTED", `Recovery bundle requires Relay ${sourceVersion}; current Relay is ${currentVersion}.`);
  }
}

function sqliteIntegrity(path: string, code: string): "ok" {
  let db: Database.Database | undefined;
  try {
    db = new Database(path, { readonly: true, fileMustExist: true });
    const result = db.pragma("quick_check", { simple: true });
    if (result !== "ok") throw new Error(String(result));
    return "ok";
  } catch (error) {
    throw new RelayRecoveryError(code, `SQLite integrity check failed for ${basename(path)}.`, 400, { cause: error });
  } finally {
    db?.close();
  }
}

export async function extractAndVerifyRecovery(input: {
  bundlePath: string;
  keyFile: string;
  expectedCellId: string;
  currentRelayVersion: string;
}): Promise<VerifiedRecovery> {
  const bundlePath = resolve(input.bundlePath);
  if (!existsSync(bundlePath)) throw new RelayRecoveryError("RECOVERY_BUNDLE_NOT_FOUND", "Recovery bundle was not found.", 404);
  const { header, headerBytes, ciphertextStart, tag } = readHeader(bundlePath);
  if (header.cellId !== input.expectedCellId) throw new RelayRecoveryError("RECOVERY_CELL_MISMATCH", "Recovery bundle belongs to a different Relay Cell.", 409);
  assertRelayCompatibility(header.relayVersion, input.currentRelayVersion);
  const key = readRecoveryKeyFile(input.keyFile, resolve(bundlePath, ".."));
  const stagingDir = mkdtempSync(join(tmpdir(), "relay-recovery-verify-"));
  chmodSync(stagingDir, 0o700);
  let unsafeEntry: RelayRecoveryError | undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv, "base64url"), { authTagLength: RECOVERY_TAG_BYTES });
    decipher.setAAD(headerBytes);
    decipher.setAuthTag(tag);
    const ciphertextEnd = statSync(bundlePath).size - RECOVERY_TAG_BYTES - 1;
    await pipeline(
      createReadStream(bundlePath, { start: ciphertextStart, end: ciphertextEnd }),
      decipher,
      tar.extract({
        cwd: stagingDir,
        strict: true,
        filter: (path, entry) => {
          try { return ensureSafeEntry(path, "type" in entry ? entry.type : undefined); }
          catch (error) {
            unsafeEntry = error instanceof RelayRecoveryError ? error : new RelayRecoveryError("RECOVERY_ARCHIVE_ENTRY_REFUSED", "Recovery payload contains an unsafe archive entry.", 400, { cause: error });
            return false;
          }
        },
      }),
    );
    if (unsafeEntry) throw unsafeEntry;
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    if (error instanceof RelayRecoveryError) throw error;
    throw new RelayRecoveryError("RECOVERY_AUTHENTICATION_FAILED", "Recovery bundle authentication failed; the key is wrong or the bundle is damaged.", 400, { cause: error });
  }

  try {
    const payloadResult = recoveryPayloadSchema.safeParse(JSON.parse(readFileSync(join(stagingDir, "payload.json"), "utf8")));
    if (!payloadResult.success) throw new RelayRecoveryError("RECOVERY_PAYLOAD_INVALID", "Recovery payload metadata is invalid.");
    const payload = payloadResult.data;
    if (payload.cellId !== header.cellId || payload.snapshotId !== header.snapshotId) {
      throw new RelayRecoveryError("RECOVERY_PAYLOAD_IDENTITY_MISMATCH", "Recovery payload identity does not match its authenticated header.");
    }
    readAndVerifySnapshotManifest(join(stagingDir, "snapshot"), header.cellId);
    const dbIntegrity = sqliteIntegrity(join(stagingDir, "snapshot", "snapshot.db"), "RECOVERY_DATABASE_CORRUPT");
    const authPath = join(stagingDir, "snapshot", "auth.db");
    const authIntegrity = existsSync(authPath) ? sqliteIntegrity(authPath, "RECOVERY_AUTH_DATABASE_CORRUPT") : "absent";
    const secretPath = join(stagingDir, "secret-root.bin");
    if (payload.secretRoot.present) {
      if (!existsSync(secretPath) || sha256File(secretPath) !== payload.secretRoot.sha256) {
        throw new RelayRecoveryError("RECOVERY_SECRET_ROOT_MISMATCH", "Recovery secret root failed verification.");
      }
    } else if (existsSync(secretPath)) {
      throw new RelayRecoveryError("RECOVERY_SECRET_ROOT_UNEXPECTED", "Recovery payload contains an undeclared secret root.");
    }
    return {
      header,
      payload,
      stagingDir,
      bundleSha256: sha256File(bundlePath),
      keyFingerprint: recoveryKeyFingerprint(key),
      dbIntegrity,
      authIntegrity,
    };
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    if (error instanceof RelayRecoveryError) throw error;
    if (error instanceof SnapshotIntegrityError) throw new RelayRecoveryError(error.code, error.message, 400, { cause: error });
    throw new RelayRecoveryError("RECOVERY_PAYLOAD_INVALID", "Recovery payload validation failed.", 400, { cause: error });
  }
}

export function removeVerifiedRecovery(verified: VerifiedRecovery): void {
  rmSync(verified.stagingDir, { recursive: true, force: true });
}

export function snapshotPayloadPath(verified: VerifiedRecovery): string {
  const path = resolve(verified.stagingDir, "snapshot");
  const rel = relative(resolve(verified.stagingDir), path);
  if (rel.startsWith("..")) throw new RelayRecoveryError("RECOVERY_STAGING_PATH_INVALID", "Recovery staging path is invalid.");
  return path;
}
