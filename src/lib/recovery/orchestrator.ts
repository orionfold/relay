import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import * as tar from "tar";
import { dataDir } from "@/lib/config/env";
import { relayProductVersion } from "@/lib/config/version";
import {
  createSnapshot,
  currentSnapshotCellId,
  readAndVerifySnapshotManifest,
  type SnapshotManifestV2,
} from "@/lib/snapshots/snapshot-manager";
import { RelayRecoveryError, recoveryError } from "./errors";
import { encryptRecoveryPayload, extractAndVerifyRecovery, removeVerifiedRecovery } from "./format";
import { recoveryConfiguration } from "./key";
import { recoveryPayloadSchema, recoveryReceiptSchema, type RecoveryReceipt, type VerifiedRecovery } from "./types";

const RECOVERY_LOCK_STALE_MS = 60 * 60 * 1000;
const RECEIPT_DIR = "recovery/receipts";
const FILE_ARCHIVE_ROOTS = new Set(["uploads", "screenshots", "outputs", "sessions", "documents", "logs"]);
let recoveryLocked = false;

export type RecoveryOptions = {
  destination?: string;
  keyFile?: string;
  cellId?: string;
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function resolvedConfig(options: RecoveryOptions): { destination: string; keyFile: string; cellId: string } {
  const destination = options.destination || process.env.RELAY_RECOVERY_DESTINATION;
  const keyFile = options.keyFile || process.env.RELAY_RECOVERY_KEY_FILE;
  if (!destination) throw new RelayRecoveryError("RECOVERY_DESTINATION_REQUIRED", "Set RELAY_RECOVERY_DESTINATION or pass a destination.");
  if (!keyFile) throw new RelayRecoveryError("RECOVERY_KEY_REQUIRED", "Set RELAY_RECOVERY_KEY_FILE or pass a recovery key file.");
  const resolvedDestination = resolve(destination);
  const root = resolve(dataDir());
  const lexicalRel = relative(root, resolvedDestination);
  if (lexicalRel === "" || (!lexicalRel.startsWith("..") && !isAbsolute(lexicalRel))) {
    throw new RelayRecoveryError("RECOVERY_DESTINATION_INSIDE_CELL", "Recovery destination must be outside the Relay Cell data directory.");
  }
  mkdirSync(resolvedDestination, { recursive: true, mode: 0o700 });
  const destinationStat = lstatSync(resolvedDestination);
  if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
    throw new RelayRecoveryError("RECOVERY_DESTINATION_INVALID", "Recovery destination must be a regular directory, not a link.");
  }
  const actualRoot = existsSync(root) ? realpathSync(root) : root;
  const actualDestination = realpathSync(resolvedDestination);
  const rel = relative(actualRoot, actualDestination);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new RelayRecoveryError("RECOVERY_DESTINATION_INSIDE_CELL", "Recovery destination must be outside the Relay Cell data directory.");
  }
  return { destination: resolvedDestination, keyFile: resolve(keyFile), cellId: options.cellId || currentSnapshotCellId() };
}

function lockPath(root = dataDir()): string {
  return join(root, "recovery", "operation.lock");
}

export function reconcileRecoveryState(destination?: string, root = dataDir()): number {
  let cleaned = 0;
  const lock = lockPath(root);
  if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > RECOVERY_LOCK_STALE_MS) {
    unlinkSync(lock);
    cleaned++;
  }
  if (destination && existsSync(destination)) {
    for (const name of readdirSync(destination)) {
      const path = join(destination, name);
      const stale = Date.now() - statSync(path).mtimeMs > RECOVERY_LOCK_STALE_MS;
      const incomplete = name.includes(".partial-") || name.includes(".candidate-");
      if (incomplete && stale) {
        rmSync(path, { force: true, recursive: true });
        cleaned++;
      }
    }
  }
  return cleaned;
}

async function withRecoveryLock<T>(destination: string | undefined, operation: () => Promise<T>): Promise<T> {
  if (recoveryLocked) throw new RelayRecoveryError("RECOVERY_BUSY", "Another recovery operation is already in progress.", 409);
  reconcileRecoveryState(destination);
  const path = lockPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    throw new RelayRecoveryError("RECOVERY_BUSY", "Another recovery operation is already in progress.", 409, { cause: error });
  }
  recoveryLocked = true;
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    fsyncSync(fd);
    return await operation();
  } finally {
    recoveryLocked = false;
    closeSync(fd!);
    rmSync(path, { force: true });
  }
}

function receiptPath(receipt: RecoveryReceipt, root = dataDir()): string {
  return join(root, RECEIPT_DIR, `${receipt.startedAt.replace(/[:.]/g, "-")}-${receipt.operationId}.json`);
}

function persistReceipt(receipt: RecoveryReceipt, root = dataDir()): void {
  const parsed = recoveryReceiptSchema.parse(receipt);
  const path = receiptPath(parsed, root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const partial = `${path}.partial`;
  let fd: number | undefined;
  try {
    fd = openSync(partial, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(parsed, null, 2));
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(partial, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(partial, { force: true });
  }
}

function persistBundleReceipt(bundlePath: string, receipt: RecoveryReceipt): void {
  const path = `${bundlePath}.receipt.json`;
  const partial = `${path}.partial-${randomUUID()}`;
  let fd: number | undefined;
  try {
    fd = openSync(partial, "wx", 0o600);
    writeFileSync(fd, JSON.stringify(recoveryReceiptSchema.parse(receipt), null, 2));
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(partial, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(partial, { force: true });
  }
}

function buildReceipt(input: Partial<RecoveryReceipt> & Pick<RecoveryReceipt, "operation" | "status" | "reasonCode" | "cellId" | "bundleFile" | "startedAt">): RecoveryReceipt {
  const completedAt = new Date().toISOString();
  return recoveryReceiptSchema.parse({
    format: "relay-recovery-receipt-v1",
    operationId: randomUUID(),
    bundleSha256: null,
    keyFingerprint: null,
    snapshotId: null,
    dbIntegrity: "not-checked",
    authIntegrity: "not-checked",
    secretRootPresent: null,
    restoredFileCount: null,
    ...input,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(input.startedAt)),
  });
}

function copySnapshotToPayload(snapshotPath: string, payloadDir: string, manifest: SnapshotManifestV2): void {
  const target = join(payloadDir, "snapshot");
  mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const item of Object.values(manifest.artifacts)) {
    if (item && existsSync(join(snapshotPath, item.file))) copyFileSync(join(snapshotPath, item.file), join(target, item.file));
  }
  copyFileSync(join(snapshotPath, "manifest.json"), join(target, "manifest.json"));
}

export async function createRecoveryBundle(options: RecoveryOptions = {}): Promise<{ receipt: RecoveryReceipt; bundlePath: string }> {
  const config = resolvedConfig(options);
  return withRecoveryLock(config.destination, async () => {
    const startedAt = new Date().toISOString();
    let bundleFile = "pending";
    let payloadDir: string | undefined;
    let candidatePath: string | undefined;
    let publishedPath: string | undefined;
    try {
      const snapshot = await createSnapshot(`recovery-${startedAt}`, "manual");
      const manifest = readAndVerifySnapshotManifest(snapshot.filePath, config.cellId);
      payloadDir = mkdtempSync(join(tmpdir(), "relay-recovery-payload-"));
      chmodSync(payloadDir, 0o700);
      copySnapshotToPayload(snapshot.filePath, payloadDir, manifest);

      const secretRootPath = join(dataDir(), ".keyfile");
      let secretRootSha: string | null = null;
      if (existsSync(secretRootPath)) {
        const stat = lstatSync(secretRootPath);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new RelayRecoveryError("RECOVERY_SECRET_ROOT_INVALID", "Cell secret root must be a regular file.");
        copyFileSync(secretRootPath, join(payloadDir, "secret-root.bin"));
        chmodSync(join(payloadDir, "secret-root.bin"), 0o600);
        secretRootSha = sha256File(secretRootPath);
      }
      const payload = recoveryPayloadSchema.parse({
        format: "relay-recovery-payload-v1",
        snapshotManifestVersion: 2,
        cellId: config.cellId,
        snapshotId: snapshot.id,
        secretRoot: { present: secretRootSha !== null, sha256: secretRootSha },
      });
      writeFileSync(join(payloadDir, "payload.json"), JSON.stringify(payload, null, 2), { mode: 0o600 });

      const encrypted = await encryptRecoveryPayload({
        payloadDir,
        destination: config.destination,
        keyFile: config.keyFile,
        header: {
          format: "relay-recovery-v1",
          algorithm: "aes-256-gcm",
          cellId: config.cellId,
          relayVersion: relayProductVersion(),
          schemaContractVersion: 1,
          snapshotId: snapshot.id,
          createdAt: startedAt,
        },
      });
      candidatePath = encrypted.candidatePath;
      bundleFile = basename(encrypted.finalBundlePath);
      const verified = await extractAndVerifyRecovery({
        bundlePath: encrypted.candidatePath,
        keyFile: config.keyFile,
        expectedCellId: config.cellId,
        currentRelayVersion: relayProductVersion(),
      });
      const restoredFileCount = await drillFileArchive(verified);
      removeVerifiedRecovery(verified);
      renameSync(encrypted.candidatePath, encrypted.finalBundlePath);
      candidatePath = undefined;
      publishedPath = encrypted.finalBundlePath;
      const receipt = buildReceipt({
        operation: "create",
        status: "ready",
        reasonCode: "RECOVERY_READY",
        cellId: config.cellId,
        bundleFile,
        bundleSha256: encrypted.bundleSha256,
        keyFingerprint: encrypted.keyFingerprint,
        snapshotId: snapshot.id,
        startedAt,
        dbIntegrity: "ok",
        authIntegrity: manifest.artifacts.auth ? "ok" : "absent",
        secretRootPresent: payload.secretRoot.present,
        restoredFileCount,
      });
      persistBundleReceipt(encrypted.finalBundlePath, receipt);
      persistReceipt(receipt);
      publishedPath = undefined;
      return { receipt, bundlePath: encrypted.finalBundlePath };
    } catch (error) {
      const named = recoveryError(error);
      if (publishedPath) {
        rmSync(publishedPath, { force: true });
        rmSync(`${publishedPath}.receipt.json`, { force: true });
      }
      persistReceipt(buildReceipt({ operation: "create", status: "failed", reasonCode: named.code, cellId: config.cellId, bundleFile, startedAt }));
      throw named;
    } finally {
      if (candidatePath) rmSync(candidatePath, { force: true });
      if (payloadDir) rmSync(payloadDir, { recursive: true, force: true });
    }
  });
}

async function verifyOperation(input: { operation: "verify" | "drill"; bundlePath: string; keyFile: string; cellId: string }): Promise<RecoveryReceipt> {
  return withRecoveryLock(undefined, async () => {
    const startedAt = new Date().toISOString();
    let verified: VerifiedRecovery | undefined;
    try {
      verified = await extractAndVerifyRecovery({
        bundlePath: input.bundlePath,
        keyFile: input.keyFile,
        expectedCellId: input.cellId,
        currentRelayVersion: relayProductVersion(),
      });
      const restoredFileCount = input.operation === "drill" ? await drillFileArchive(verified) : null;
      const receipt = buildReceipt({
        operation: input.operation,
        status: "verified",
        reasonCode: input.operation === "drill" ? "RECOVERY_DRILL_VERIFIED" : "RECOVERY_VERIFIED",
        cellId: input.cellId,
        bundleFile: basename(input.bundlePath),
        bundleSha256: verified.bundleSha256,
        keyFingerprint: verified.keyFingerprint,
        snapshotId: verified.header.snapshotId,
        startedAt,
        dbIntegrity: verified.dbIntegrity,
        authIntegrity: verified.authIntegrity,
        secretRootPresent: verified.payload.secretRoot.present,
        restoredFileCount,
      });
      persistReceipt(receipt);
      return receipt;
    } catch (error) {
      const named = recoveryError(error);
      persistReceipt(buildReceipt({ operation: input.operation, status: "failed", reasonCode: named.code, cellId: input.cellId, bundleFile: basename(input.bundlePath), startedAt }));
      throw named;
    } finally {
      if (verified) removeVerifiedRecovery(verified);
    }
  });
}

export function verifyRecoveryBundle(input: { bundlePath: string; keyFile: string; cellId?: string }): Promise<RecoveryReceipt> {
  return verifyOperation({ ...input, operation: "verify", cellId: input.cellId || currentSnapshotCellId() });
}

export function drillRecoveryBundle(input: { bundlePath: string; keyFile: string; cellId?: string }): Promise<RecoveryReceipt> {
  return verifyOperation({ ...input, operation: "drill", cellId: input.cellId || currentSnapshotCellId() });
}

function safeFileArchiveEntry(path: string, entryType?: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || !FILE_ARCHIVE_ROOTS.has(parts[0]) || parts.some((part) => part === "..")) {
    throw new RelayRecoveryError("RECOVERY_FILE_ARCHIVE_ENTRY_REFUSED", `Snapshot file archive contains an unsafe entry: ${normalized}`);
  }
  if (entryType && !["File", "OldFile", "ContiguousFile", "Directory"].includes(entryType)) {
    throw new RelayRecoveryError("RECOVERY_FILE_ARCHIVE_ENTRY_REFUSED", `Snapshot file archive contains an unsafe ${entryType} entry: ${normalized}`);
  }
  return true;
}

function countFiles(root: string): number {
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) count += countFiles(path);
    else if (entry.isFile()) count++;
  }
  return count;
}

async function drillFileArchive(verified: VerifiedRecovery): Promise<number> {
  const root = mkdtempSync(join(tmpdir(), "relay-recovery-drill-"));
  chmodSync(root, 0o700);
  let unsafeEntry: RelayRecoveryError | undefined;
  try {
    await tar.extract({
      file: join(verified.stagingDir, "snapshot", "files.tar.gz"),
      cwd: root,
      strict: true,
      filter: (path, entry) => {
        try { return safeFileArchiveEntry(path, "type" in entry ? entry.type : undefined); }
        catch (error) {
          unsafeEntry = error instanceof RelayRecoveryError ? error : new RelayRecoveryError("RECOVERY_FILE_ARCHIVE_ENTRY_REFUSED", "Snapshot file archive contains an unsafe entry.", 400, { cause: error });
          return false;
        }
      },
    });
    if (unsafeEntry) throw unsafeEntry;
    return countFiles(root);
  } catch (error) {
    if (error instanceof RelayRecoveryError) throw error;
    throw new RelayRecoveryError("RECOVERY_FILE_ARCHIVE_INVALID", "Recovery file archive failed its isolated restore drill.", 400, { cause: error });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function assertEmptyTarget(target: string): void {
  if (!existsSync(target)) return;
  const stat = lstatSync(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || readdirSync(target).length > 0) {
    throw new RelayRecoveryError("RECOVERY_TARGET_NOT_EMPTY", "Offline restore target must be missing or an empty directory.", 409);
  }
}

async function withRestoreTargetLock<T>(target: string, operation: () => Promise<T>): Promise<T> {
  if (recoveryLocked) throw new RelayRecoveryError("RECOVERY_BUSY", "Another recovery operation is already in progress.", 409);
  const path = `${target}.restore.lock`;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (existsSync(path) && Date.now() - statSync(path).mtimeMs > RECOVERY_LOCK_STALE_MS) rmSync(path, { force: true });
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch (error) {
    throw new RelayRecoveryError("RECOVERY_BUSY", "Another restore operation is already in progress for this target.", 409, { cause: error });
  }
  recoveryLocked = true;
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    fsyncSync(fd);
    return await operation();
  } finally {
    recoveryLocked = false;
    closeSync(fd!);
    rmSync(path, { force: true });
  }
}

async function restoreRecoveryBundleUnlocked(input: { bundlePath: string; keyFile: string; targetDataDir: string; cellId?: string }): Promise<RecoveryReceipt> {
  const cellId = input.cellId || currentSnapshotCellId();
  const target = resolve(input.targetDataDir);
  assertEmptyTarget(target);
  const startedAt = new Date().toISOString();
  let verified: VerifiedRecovery | undefined;
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const staging = mkdtempSync(join(dirname(target), `.relay-restore-${basename(target)}-`));
  let unsafeEntry: RelayRecoveryError | undefined;
  try {
    verified = await extractAndVerifyRecovery({ bundlePath: input.bundlePath, keyFile: input.keyFile, expectedCellId: cellId, currentRelayVersion: relayProductVersion() });
    const snapshotRoot = join(verified.stagingDir, "snapshot");
    const manifest = readAndVerifySnapshotManifest(snapshotRoot, cellId);
    copyFileSync(join(snapshotRoot, "snapshot.db"), join(staging, "relay.db"));
    if (existsSync(join(snapshotRoot, "auth.db"))) {
      copyFileSync(join(snapshotRoot, "auth.db"), join(staging, "relay-auth.db"));
      chmodSync(join(staging, "relay-auth.db"), 0o600);
    }
    if (verified.payload.secretRoot.present) {
      copyFileSync(join(verified.stagingDir, "secret-root.bin"), join(staging, ".keyfile"));
      chmodSync(join(staging, ".keyfile"), 0o600);
    }
    await tar.extract({
      file: join(snapshotRoot, "files.tar.gz"),
      cwd: staging,
      strict: true,
      filter: (path, entry) => {
        try { return safeFileArchiveEntry(path, "type" in entry ? entry.type : undefined); }
        catch (error) {
          unsafeEntry = error instanceof RelayRecoveryError ? error : new RelayRecoveryError("RECOVERY_FILE_ARCHIVE_ENTRY_REFUSED", "Snapshot file archive contains an unsafe entry.", 400, { cause: error });
          return false;
        }
      },
    });
    if (unsafeEntry) throw unsafeEntry;
    const restoredFileCount = countFiles(staging);
    const relayDb = new Database(join(staging, "relay.db"), { readonly: true, fileMustExist: true });
    try {
      if (relayDb.pragma("quick_check", { simple: true }) !== "ok") throw new RelayRecoveryError("RECOVERY_DATABASE_CORRUPT", "Restored Relay database failed integrity verification.");
    } finally { relayDb.close(); }
    const receipt = buildReceipt({
      operation: "restore",
      status: "restored",
      reasonCode: "RECOVERY_RESTORED",
      cellId,
      bundleFile: basename(input.bundlePath),
      bundleSha256: verified.bundleSha256,
      keyFingerprint: verified.keyFingerprint,
      snapshotId: verified.header.snapshotId,
      startedAt,
      dbIntegrity: "ok",
      authIntegrity: manifest.artifacts.auth ? "ok" : "absent",
      secretRootPresent: verified.payload.secretRoot.present,
      restoredFileCount,
    });
    persistReceipt(receipt, staging);
    if (existsSync(target)) rmSync(target, { recursive: true });
    renameSync(staging, target);
    return receipt;
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw recoveryError(error);
  } finally {
    if (verified) removeVerifiedRecovery(verified);
  }
}

export function restoreRecoveryBundle(input: { bundlePath: string; keyFile: string; targetDataDir: string; cellId?: string }): Promise<RecoveryReceipt> {
  const target = resolve(input.targetDataDir);
  return withRestoreTargetLock(target, () => restoreRecoveryBundleUnlocked(input));
}

export function listRecoveryReceipts(limit = 20): RecoveryReceipt[] {
  const root = join(dataDir(), RECEIPT_DIR);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => name.endsWith(".json"))
    .sort().reverse().slice(0, Math.max(1, Math.min(limit, 100)))
    .map((name) => {
      try {
        const parsed = recoveryReceiptSchema.safeParse(JSON.parse(readFileSync(join(root, name), "utf8")));
        if (!parsed.success) throw new Error(parsed.error.message);
        return parsed.data;
      } catch (error) {
        throw new RelayRecoveryError("RECOVERY_RECEIPT_INVALID", `Recovery receipt is invalid: ${name}`, 500, { cause: error });
      }
    });
}

export function recoveryStatus() {
  const configuration = recoveryConfiguration();
  const receipts = listRecoveryReceipts();
  return { ...configuration, latest: receipts[0] ?? null, receipts };
}

export function enforceRecoveryRetention(input: { destination: string; cellId: string; maxCount?: number; maxAgeDays?: number; now?: number }): number {
  if (input.maxCount !== undefined && (!Number.isInteger(input.maxCount) || input.maxCount <= 0)) {
    throw new RelayRecoveryError("RECOVERY_RETENTION_INVALID", "Recovery max count must be a positive integer.");
  }
  if (input.maxAgeDays !== undefined && (!Number.isInteger(input.maxAgeDays) || input.maxAgeDays <= 0)) {
    throw new RelayRecoveryError("RECOVERY_RETENTION_INVALID", "Recovery max age must be a positive integer number of days.");
  }
  const now = input.now ?? Date.now();
  const destination = resolve(input.destination);
  if (!existsSync(destination)) return 0;
  const candidates = readdirSync(destination)
    .filter((name) => name.startsWith(`relay-${input.cellId}-`) && name.endsWith(".relay-recovery"))
    .map((name) => ({ name, path: join(destination, name), mtimeMs: statSync(join(destination, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  let deleted = 0;
  for (const [index, item] of candidates.entries()) {
    const tooMany = Boolean(input.maxCount && input.maxCount > 0 && index >= input.maxCount);
    const tooOld = Boolean(input.maxAgeDays && input.maxAgeDays > 0 && now - item.mtimeMs > input.maxAgeDays * 86_400_000);
    if (!tooMany && !tooOld) continue;
    rmSync(item.path, { force: true });
    rmSync(`${item.path}.receipt.json`, { force: true });
    deleted++;
  }
  return deleted;
}
