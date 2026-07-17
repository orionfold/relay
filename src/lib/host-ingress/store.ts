import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "@/lib/config/env";
import {
  hashOpaqueSecret,
  hashPassword,
  randomSecret,
  secureEqual,
  verifyPassword,
} from "./credentials";

const AUTH_DB_NAME = "relay-auth.db";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const BOOTSTRAP_TTL_MS = 15 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_LIMIT = 8;

export type AuthSession = {
  id: string;
  deviceName: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
  current?: boolean;
};

export type AuthEvent = {
  id: string;
  eventType: string;
  reasonCode: string;
  sessionId: string | null;
  clientHash: string | null;
  createdAt: number;
};

export type SessionIssue = { token: string; session: AuthSession };

export class AuthRateLimitError extends Error {
  readonly code = "AUTH_RATE_LIMITED" as const;
  constructor() {
    super("Too many authentication attempts. Try again later.");
    this.name = "AuthRateLimitError";
  }
}

export class AuthCredentialError extends Error {
  readonly code: string;
  constructor(code: string, message = "The credential was not accepted.") {
    super(message);
    this.name = "AuthCredentialError";
    this.code = code;
  }
}

function openAuthDb(): Database.Database {
  const root = dataDir();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, AUTH_DB_NAME);
  const db = new Database(path);
  try {
    chmodSync(path, 0o600);
  } catch {
    db.close();
    throw new Error("AUTH_STORE_PERMISSIONS_FAILED");
  }
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_admin (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      credential_version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_bootstrap (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      credential_version INTEGER NOT NULL,
      device_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS auth_recovery_codes (
      code_hash TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      used_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS auth_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      session_id TEXT,
      client_hash TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      bucket_key TEXT PRIMARY KEY,
      window_started_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at DESC);
  `);
  for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      chmodSync(candidate, 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        db.close();
        throw new Error("AUTH_STORE_PERMISSIONS_FAILED");
      }
    }
  }
  return db;
}

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = openAuthDb();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export function authIsConfigured(): boolean {
  return withDb((db) => Boolean(db.prepare("SELECT 1 FROM auth_admin WHERE id = 1").get()));
}

export function createBootstrapToken(now = Date.now()): { token: string; expiresAt: number } {
  const token = randomSecret();
  const expiresAt = now + BOOTSTRAP_TTL_MS;
  withDb((db) => {
    const configured = db.prepare("SELECT 1 FROM auth_admin WHERE id = 1").get();
    if (configured) throw new AuthCredentialError("AUTH_ALREADY_CONFIGURED", "Relay access is already configured.");
    db.prepare(`
      INSERT INTO auth_bootstrap (id, token_hash, expires_at, consumed_at, created_at)
      VALUES (1, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        consumed_at = NULL,
        created_at = excluded.created_at
    `).run(hashOpaqueSecret(token), expiresAt, now);
    writeEvent(db, "bootstrap.issued", "BOOTSTRAP_ISSUED", null, null, now);
  });
  return { token, expiresAt };
}

export function completeBootstrap(input: {
  token: string;
  password: string;
  deviceName: string;
  rateKey: string;
  clientHash?: string;
  now?: number;
}): SessionIssue & { recoveryCodes: string[] } {
  const now = input.now ?? Date.now();
  const passwordHash = hashPassword(input.password);
  return withDb((db) => {
    enforceRateLimit(db, input.rateKey, now);
    db.exec("BEGIN IMMEDIATE");
    try {
      const existing = db.prepare("SELECT 1 FROM auth_admin WHERE id = 1").get();
      if (existing) throw new AuthCredentialError("AUTH_ALREADY_CONFIGURED");
      const bootstrap = db.prepare(
        "SELECT token_hash AS tokenHash, expires_at AS expiresAt, consumed_at AS consumedAt FROM auth_bootstrap WHERE id = 1",
      ).get() as { tokenHash: string; expiresAt: number; consumedAt: number | null } | undefined;
      if (!bootstrap || bootstrap.consumedAt !== null) throw new AuthCredentialError("BOOTSTRAP_REPLAYED");
      if (bootstrap.expiresAt <= now) throw new AuthCredentialError("BOOTSTRAP_EXPIRED");
      if (!secureEqual(bootstrap.tokenHash, hashOpaqueSecret(input.token))) {
        throw new AuthCredentialError("BOOTSTRAP_INVALID");
      }

      db.prepare(
        "INSERT INTO auth_admin (id, username, password_hash, credential_version, created_at, updated_at) VALUES (1, 'admin', ?, 1, ?, ?)",
      ).run(passwordHash, now, now);
      db.prepare("UPDATE auth_bootstrap SET consumed_at = ? WHERE id = 1").run(now);
      const recoveryCodes = Array.from({ length: 8 }, () => randomSecret(12));
      const insertRecovery = db.prepare(
        "INSERT INTO auth_recovery_codes (code_hash, created_at, used_at) VALUES (?, ?, NULL)",
      );
      for (const code of recoveryCodes) insertRecovery.run(hashOpaqueSecret(code), now);
      const issue = issueSession(db, input.deviceName, 1, now);
      clearRateLimit(db, input.rateKey);
      writeEvent(db, "bootstrap.completed", "BOOTSTRAP_COMPLETED", issue.session.id, input.clientHash, now);
      db.exec("COMMIT");
      return { ...issue, recoveryCodes };
    } catch (error) {
      db.exec("ROLLBACK");
      writeEvent(db, "bootstrap.rejected", authErrorCode(error), null, input.clientHash, now);
      throw error;
    }
  });
}

export function login(input: {
  password: string;
  deviceName: string;
  rateKey: string;
  clientHash?: string;
  now?: number;
}): SessionIssue {
  const now = input.now ?? Date.now();
  return withDb((db) => {
    enforceRateLimit(db, input.rateKey, now);
    const admin = db.prepare(
      "SELECT password_hash AS passwordHash, credential_version AS credentialVersion FROM auth_admin WHERE id = 1",
    ).get() as { passwordHash: string; credentialVersion: number } | undefined;
    if (!admin || !verifyPassword(input.password, admin.passwordHash)) {
      writeEvent(db, "login.rejected", "LOGIN_INVALID", null, input.clientHash, now);
      throw new AuthCredentialError("LOGIN_INVALID");
    }
    clearRateLimit(db, input.rateKey);
    const issue = issueSession(db, input.deviceName, admin.credentialVersion, now);
    writeEvent(db, "login.completed", "LOGIN_COMPLETED", issue.session.id, input.clientHash, now);
    return issue;
  });
}

export function recover(input: {
  recoveryCode: string;
  newPassword: string;
  deviceName: string;
  rateKey: string;
  clientHash?: string;
  now?: number;
}): SessionIssue & { recoveryCodes: string[] } {
  const now = input.now ?? Date.now();
  const passwordHash = hashPassword(input.newPassword);
  return withDb((db) => {
    enforceRateLimit(db, input.rateKey, now);
    db.exec("BEGIN IMMEDIATE");
    try {
      const row = db.prepare(
        "SELECT used_at AS usedAt FROM auth_recovery_codes WHERE code_hash = ?",
      ).get(hashOpaqueSecret(input.recoveryCode)) as { usedAt: number | null } | undefined;
      if (!row || row.usedAt !== null) throw new AuthCredentialError("RECOVERY_INVALID");
      const admin = db.prepare("SELECT credential_version AS version FROM auth_admin WHERE id = 1").get() as
        | { version: number }
        | undefined;
      if (!admin) throw new AuthCredentialError("AUTH_NOT_CONFIGURED");
      const nextVersion = admin.version + 1;
      db.prepare(
        "UPDATE auth_admin SET password_hash = ?, credential_version = ?, updated_at = ? WHERE id = 1",
      ).run(passwordHash, nextVersion, now);
      db.prepare("UPDATE auth_recovery_codes SET used_at = ? WHERE code_hash = ?").run(
        now,
        hashOpaqueSecret(input.recoveryCode),
      );
      db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE revoked_at IS NULL").run(now);
      db.prepare("DELETE FROM auth_recovery_codes WHERE used_at IS NULL").run();
      const recoveryCodes = Array.from({ length: 8 }, () => randomSecret(12));
      const insertRecovery = db.prepare(
        "INSERT INTO auth_recovery_codes (code_hash, created_at, used_at) VALUES (?, ?, NULL)",
      );
      for (const code of recoveryCodes) insertRecovery.run(hashOpaqueSecret(code), now);
      const issue = issueSession(db, input.deviceName, nextVersion, now);
      clearRateLimit(db, input.rateKey);
      writeEvent(db, "recovery.completed", "RECOVERY_COMPLETED", issue.session.id, input.clientHash, now);
      db.exec("COMMIT");
      return { ...issue, recoveryCodes };
    } catch (error) {
      db.exec("ROLLBACK");
      writeEvent(db, "recovery.rejected", authErrorCode(error), null, input.clientHash, now);
      throw error;
    }
  });
}

export function validateSession(token: string, now = Date.now()): AuthSession | null {
  return withDb((db) => {
    const row = db.prepare(`
      SELECT s.id, s.device_name AS deviceName, s.created_at AS createdAt,
             s.expires_at AS expiresAt, s.last_seen_at AS lastSeenAt,
             s.revoked_at AS revokedAt, s.credential_version AS sessionVersion,
             a.credential_version AS adminVersion
      FROM auth_sessions s JOIN auth_admin a ON a.id = 1
      WHERE s.token_hash = ?
    `).get(hashOpaqueSecret(token)) as
      | (AuthSession & { revokedAt: number | null; sessionVersion: number; adminVersion: number })
      | undefined;
    if (!row || row.revokedAt !== null || row.expiresAt <= now || row.sessionVersion !== row.adminVersion) return null;
    if (now - row.lastSeenAt > 60_000) {
      db.prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?").run(now, row.id);
    }
    return {
      id: row.id,
      deviceName: row.deviceName,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      lastSeenAt: now,
    };
  });
}

export function listSessions(currentSessionId?: string, now = Date.now()): AuthSession[] {
  return withDb((db) =>
    (db.prepare(`
      SELECT id, device_name AS deviceName, created_at AS createdAt,
             expires_at AS expiresAt, last_seen_at AS lastSeenAt
      FROM auth_sessions WHERE revoked_at IS NULL AND expires_at > ?
      ORDER BY last_seen_at DESC
    `).all(now) as AuthSession[]).map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    })),
  );
}

export function revokeSession(sessionId: string, actorSessionId: string, now = Date.now()): boolean {
  return withDb((db) => {
    const result = db.prepare(
      "UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
    ).run(now, sessionId);
    if (result.changes > 0) writeEvent(db, "session.revoked", "SESSION_REVOKED", actorSessionId, null, now);
    return result.changes > 0;
  });
}

export function listAuthEvents(limit = 50): AuthEvent[] {
  return withDb((db) =>
    db.prepare(`
      SELECT id, event_type AS eventType, reason_code AS reasonCode,
             session_id AS sessionId, client_hash AS clientHash, created_at AS createdAt
      FROM auth_events ORDER BY created_at DESC LIMIT ?
    `).all(Math.max(1, Math.min(limit, 100))) as AuthEvent[],
  );
}

function issueSession(
  db: Database.Database,
  deviceName: string,
  credentialVersion: number,
  now: number,
): SessionIssue {
  const token = randomSecret();
  const session: AuthSession = {
    id: randomUUID(),
    deviceName: deviceName.trim().slice(0, 80) || "Browser",
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: now,
  };
  db.prepare(`
    INSERT INTO auth_sessions
      (id, token_hash, credential_version, device_name, created_at, expires_at, last_seen_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    session.id,
    hashOpaqueSecret(token),
    credentialVersion,
    session.deviceName,
    now,
    session.expiresAt,
    now,
  );
  return { token, session };
}

function enforceRateLimit(db: Database.Database, key: string, now: number): void {
  const bucket = hashOpaqueSecret(key);
  const row = db.prepare(
    "SELECT window_started_at AS startedAt, attempts FROM auth_rate_limits WHERE bucket_key = ?",
  ).get(bucket) as { startedAt: number; attempts: number } | undefined;
  if (!row || now - row.startedAt >= LOGIN_WINDOW_MS) {
    db.prepare(`
      INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts) VALUES (?, ?, 1)
      ON CONFLICT(bucket_key) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1
    `).run(bucket, now);
    return;
  }
  if (row.attempts >= LOGIN_ATTEMPT_LIMIT) throw new AuthRateLimitError();
  db.prepare("UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE bucket_key = ?").run(bucket);
}

function clearRateLimit(db: Database.Database, key: string): void {
  db.prepare("DELETE FROM auth_rate_limits WHERE bucket_key = ?").run(hashOpaqueSecret(key));
}

function writeEvent(
  db: Database.Database,
  eventType: string,
  reasonCode: string,
  sessionId: string | null,
  clientHash: string | undefined | null,
  now: number,
): void {
  db.prepare(`
    INSERT INTO auth_events (id, event_type, reason_code, session_id, client_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), eventType, reasonCode, sessionId, clientHash || null, now);
}

function authErrorCode(error: unknown): string {
  return error instanceof AuthCredentialError || error instanceof AuthRateLimitError
    ? error.code
    : "AUTH_INTERNAL_ERROR";
}
