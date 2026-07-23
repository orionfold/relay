import { describe, expect, it } from "vitest";
import {
  classifyRuntimeReadiness,
  unverifiedRuntimeReadiness,
} from "../runtime-readiness";

describe("runtime readiness evidence", () => {
  it("does not equate a saved credential with a verified connection", () => {
    expect(unverifiedRuntimeReadiness("db")).toMatchObject({
      phase: "saved-unverified",
      ready: false,
      checkedAt: null,
      credentialSource: "db",
      endpointReachable: null,
    });
  });

  it("marks only a successful probe ready", () => {
    expect(
      classifyRuntimeReadiness({
        connected: true,
        credentialSource: "oauth",
        checkedAt: "2026-07-23T00:00:00.000Z",
      }),
    ).toEqual({
      phase: "verified",
      ready: true,
      checkedAt: "2026-07-23T00:00:00.000Z",
      credentialSource: "oauth",
      endpointReachable: true,
      reason: null,
    });
  });

  it("distinguishes rejected authentication from a network outage", () => {
    expect(
      classifyRuntimeReadiness({
        connected: false,
        error: "401 Incorrect API key",
        credentialSource: "db",
      }),
    ).toMatchObject({
      phase: "auth-rejected",
      ready: false,
      endpointReachable: true,
    });
    expect(
      classifyRuntimeReadiness({
        connected: false,
        error: "connect ECONNREFUSED 192.168.1.8:1234",
        credentialSource: "unknown",
      }),
    ).toMatchObject({
      phase: "unreachable",
      ready: false,
      endpointReachable: false,
    });
  });

  it("names malformed provider responses separately", () => {
    expect(
      classifyRuntimeReadiness({
        connected: false,
        error: "LM Studio returned invalid JSON response",
        credentialSource: "unknown",
      }),
    ).toMatchObject({
      phase: "invalid-response",
      endpointReachable: true,
    });
  });

  it("distinguishes a reachable provider that has no generation model", () => {
    expect(
      classifyRuntimeReadiness({
        connected: false,
        error: "LM Studio reported no models. Load or configure a model before running.",
        credentialSource: "unknown",
      }),
    ).toMatchObject({
      phase: "model-required",
      ready: false,
      endpointReachable: true,
    });
  });
});
