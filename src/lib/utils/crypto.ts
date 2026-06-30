import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "fs";
import { join } from "path";
import { dataDir } from "@/lib/config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getKeyfilePath(): string {
  return join(dataDir(), ".keyfile");
}

/**
 * Read or create the encryption keyfile at ~/.relay/.keyfile.
 * File is 32 random bytes with chmod 0600 (owner-only read/write).
 */
export function getOrCreateKeyfile(): Buffer {
  const keyfilePath = getKeyfilePath();

  if (existsSync(keyfilePath)) {
    const key = readFileSync(keyfilePath);
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Invalid keyfile: expected ${KEY_LENGTH} bytes, got ${key.length}`);
    }
    return key;
  }

  // Create parent directory if needed
  const dir = join(keyfilePath, "..");
  mkdirSync(dir, { recursive: true });

  const key = randomBytes(KEY_LENGTH);
  writeFileSync(keyfilePath, key, { mode: 0o600 });
  chmodSync(keyfilePath, 0o600);
  return key;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64 string in format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getOrCreateKeyfile();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a string previously encrypted with encrypt().
 * Expects base64 format: iv:authTag:ciphertext
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format: expected iv:authTag:ciphertext");
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const key = getOrCreateKeyfile();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
