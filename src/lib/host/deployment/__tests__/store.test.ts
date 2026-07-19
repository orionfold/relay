import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RelayHostError } from "@/lib/host/supervisor/errors";
import { HostDeploymentStore } from "../store";

const roots: string[] = [];
function root() {
  const value = mkdtempSync(join(tmpdir(), "relay-host-deployment-store-"));
  roots.push(value);
  return value;
}

afterEach(() => {
  for (const value of roots.splice(0)) {
    rmSync(value, { recursive: true, force: true });
  }
});

describe("HostDeploymentStore", () => {
  it("atomically persists a strict content-free journey", () => {
    const store = new HostDeploymentStore(root());
    const saved = store.update((current) => ({
      ...current,
      stage: "estimated",
      lastReasonCode: "HOST_DEPLOYMENT_ESTIMATED",
    }));
    expect(store.read()).toEqual(saved);
  });

  it("fails closed on corrupt state and a concurrent lock", () => {
    const store = new HostDeploymentStore(root());
    writeFileSync(store.path, "{broken", "utf8");
    expect(() => store.read()).toThrowError(RelayHostError);

    const unlocked = new HostDeploymentStore(root());
    writeFileSync(`${unlocked.path}.lock`, "busy", "utf8");
    expect(() => unlocked.update((current) => current)).toThrowError(/already in progress/);
  });

  it("recovers a stale lock left by an interrupted process", () => {
    const store = new HostDeploymentStore(root());
    writeFileSync(`${store.path}.lock`, JSON.stringify({ pid: 1, startedAt: 0 }), "utf8");
    const stale = new Date(Date.now() - 31_000);
    utimesSync(`${store.path}.lock`, stale, stale);
    expect(store.update((current) => ({ ...current, lastReasonCode: "HOST_DEPLOYMENT_ESTIMATED" })).lastReasonCode)
      .toBe("HOST_DEPLOYMENT_ESTIMATED");
  });

  it("refuses credential-shaped content even when cast past the schema", () => {
    const store = new HostDeploymentStore(root());
    expect(() => store.update((current) => ({
      ...current,
      providerToken: "Bearer definitely-not-allowed",
    } as never))).toThrow();
  });
});
