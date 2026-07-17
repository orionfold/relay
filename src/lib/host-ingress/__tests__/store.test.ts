import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AuthCredentialError,
  AuthRateLimitError,
  completeBootstrap,
  createBootstrapToken,
  listAuthEvents,
  listSessions,
  login,
  recover,
  revokeSession,
  validateSession,
} from "../store";

describe("Host ingress identity store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "relay-auth-test-"));
    process.env.RELAY_DATA_DIR = dir;
  });

  afterEach(() => {
    delete process.env.RELAY_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("atomically consumes one bootstrap token and rejects replay", () => {
    const now = 1_000_000;
    const bootstrap = createBootstrapToken(now);
    const first = completeBootstrap({
      token: bootstrap.token,
      password: "a sufficiently long password",
      deviceName: "Primary browser",
      rateKey: "bootstrap:first",
      now: now + 1,
    });
    expect(validateSession(first.token, now + 2)?.deviceName).toBe("Primary browser");
    expect(first.recoveryCodes).toHaveLength(8);
    expect(() =>
      completeBootstrap({
        token: bootstrap.token,
        password: "another sufficiently long password",
        deviceName: "Attacker",
        rateKey: "bootstrap:replay",
        now: now + 2,
      }),
    ).toThrowError(AuthCredentialError);
  });

  it("rejects an expired bootstrap credential", () => {
    const bootstrap = createBootstrapToken(1_000);
    let caught: unknown;
    try {
      completeBootstrap({
        token: bootstrap.token,
        password: "a sufficiently long password",
        deviceName: "Browser",
        rateKey: "bootstrap:expired",
        now: bootstrap.expiresAt + 1,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AuthCredentialError);
    expect((caught as AuthCredentialError).code).toBe("BOOTSTRAP_EXPIRED");
  });

  it("issues independent revocable sessions and rejects expired or revoked sessions", () => {
    const now = 2_000_000;
    const bootstrap = createBootstrapToken(now);
    const first = completeBootstrap({
      token: bootstrap.token,
      password: "a sufficiently long password",
      deviceName: "Laptop",
      rateKey: "bootstrap:sessions",
      now,
    });
    const second = login({
      password: "a sufficiently long password",
      deviceName: "Phone",
      rateKey: "login:phone",
      now: now + 1,
    });
    expect(listSessions(undefined, now + 2)).toHaveLength(2);
    expect(revokeSession(second.session.id, first.session.id, now + 3)).toBe(true);
    expect(validateSession(second.token, now + 4)).toBeNull();
    expect(validateSession(first.token, first.session.expiresAt + 1)).toBeNull();
  });

  it("rate-limits repeated invalid password attempts", () => {
    const now = 3_000_000;
    const bootstrap = createBootstrapToken(now);
    completeBootstrap({
      token: bootstrap.token,
      password: "a sufficiently long password",
      deviceName: "Laptop",
      rateKey: "bootstrap:rate",
      now,
    });
    for (let attempt = 0; attempt < 8; attempt++) {
      expect(() => login({ password: "wrong", deviceName: "Browser", rateKey: "same-client", now: now + attempt + 1 })).toThrowError(AuthCredentialError);
    }
    expect(() => login({ password: "wrong", deviceName: "Browser", rateKey: "same-client", now: now + 20 })).toThrowError(AuthRateLimitError);
  });

  it("uses recovery once, rotates all codes, and revokes existing sessions", () => {
    const now = 4_000_000;
    const bootstrap = createBootstrapToken(now);
    const initial = completeBootstrap({
      token: bootstrap.token,
      password: "a sufficiently long password",
      deviceName: "Laptop",
      rateKey: "bootstrap:recovery",
      now,
    });
    const recovered = recover({
      recoveryCode: initial.recoveryCodes[0],
      newPassword: "a different long password",
      deviceName: "Recovery browser",
      rateKey: "recovery:valid",
      now: now + 1,
    });
    expect(validateSession(initial.token, now + 2)).toBeNull();
    expect(validateSession(recovered.token, now + 2)).not.toBeNull();
    expect(recovered.recoveryCodes).toHaveLength(8);
    expect(() => recover({
      recoveryCode: initial.recoveryCodes[0],
      newPassword: "yet another long password",
      deviceName: "Replay",
      rateKey: "recovery:replay",
      now: now + 3,
    })).toThrowError(AuthCredentialError);
    expect(listAuthEvents().some((event) => event.reasonCode === "RECOVERY_COMPLETED")).toBe(true);
  });
});
