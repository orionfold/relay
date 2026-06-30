import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Create an isolated temp dir for each test to avoid touching real keyfile
let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "ainative-crypto-test-"));
  vi.stubEnv("RELAY_DATA_DIR", tempDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tempDir, { recursive: true, force: true });
});

// Dynamic import so env stubs take effect
async function loadCrypto() {
  // Clear module cache so each test gets fresh env
  const mod = await import("../crypto");
  return mod;
}

describe("getOrCreateKeyfile", () => {
  it("creates a new 32-byte keyfile if none exists", async () => {
    const { getOrCreateKeyfile } = await loadCrypto();
    const key = getOrCreateKeyfile();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it("returns same key on subsequent calls", async () => {
    const { getOrCreateKeyfile } = await loadCrypto();
    const key1 = getOrCreateKeyfile();
    const key2 = getOrCreateKeyfile();
    expect(key1.equals(key2)).toBe(true);
  });

  it("throws if keyfile has wrong length", async () => {
    writeFileSync(join(tempDir, ".keyfile"), randomBytes(16));
    const { getOrCreateKeyfile } = await loadCrypto();
    expect(() => getOrCreateKeyfile()).toThrow("Invalid keyfile");
  });
});

describe("encrypt / decrypt", () => {
  it("roundtrips plaintext correctly", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const plaintext = "sk-ant-api03-test-key-123";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (unique IV)", async () => {
    const { encrypt } = await loadCrypto();
    const plaintext = "sk-ant-api03-test-key";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
  });

  it("handles empty string", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles unicode", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const plaintext = "🔑 secret key with ünïcödé";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it("throws on tampered ciphertext", async () => {
    const { encrypt, decrypt } = await loadCrypto();
    const encrypted = encrypt("secret");
    const parts = encrypted.split(":");
    // Tamper with the ciphertext portion
    const tampered = parts[0] + ":" + parts[1] + ":AAAA" + parts[2].slice(4);
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on invalid format", async () => {
    const { decrypt } = await loadCrypto();
    expect(() => decrypt("not-valid-format")).toThrow("Invalid encrypted format");
  });
});
