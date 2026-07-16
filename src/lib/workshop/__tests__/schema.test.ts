import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  BUILTIN_WORKSHOP_EDITION,
} from "@/lib/workshop/builtin";
import {
  verifyWorkshopEdition,
} from "@/lib/workshop/schema";
import { WorkshopError } from "@/lib/workshop/errors";
import { workshopErrorPayload } from "@/lib/workshop/errors";

describe("WorkshopEdition manifest", () => {
  it("accepts the pinned built-in edition and rejects tampering", () => {
    expect(
      verifyWorkshopEdition(BUILTIN_WORKSHOP_EDITION, {
        allowUnsignedHash: BUILTIN_WORKSHOP_EDITION.contentHash,
      }).id
    ).toBe("relay-operator-workshop");

    expect(() =>
      verifyWorkshopEdition(
        { ...BUILTIN_WORKSHOP_EDITION, title: "Tampered" },
        { allowUnsignedHash: BUILTIN_WORKSHOP_EDITION.contentHash }
      )
    ).toThrowError(
      expect.objectContaining<Partial<WorkshopError>>({
        code: "integrity_failed",
      })
    );
  });

  it("verifies detached Ed25519 signatures and refuses unknown keys", () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const signature = crypto
      .sign(
        null,
        Buffer.from(BUILTIN_WORKSHOP_EDITION.contentHash, "utf8"),
        privateKey
      )
      .toString("base64");
    const signed = {
      ...BUILTIN_WORKSHOP_EDITION,
      signature: {
        algorithm: "ed25519" as const,
        keyId: "test-key",
        value: signature,
      },
    };

    expect(
      verifyWorkshopEdition(signed, {
        trustedKeys: {
          "test-key": publicKey.export({ type: "spki", format: "pem" }).toString(),
        },
      }).signature?.keyId
    ).toBe("test-key");
    expect(() => verifyWorkshopEdition(signed, { trustedKeys: {} })).toThrowError(
      expect.objectContaining<Partial<WorkshopError>>({
        code: "signature_failed",
      })
    );
  });

  it("does not expose unexpected server error details", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(workshopErrorPayload(new Error("secret=/Users/operator/key"))).toEqual({
      error: "Workshop operation failed unexpectedly.",
      code: "invalid_transition",
      recovery:
        "Retry the operation. If it repeats, keep the run and inspect Relay logs.",
    });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
