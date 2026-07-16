import { describe, expect, it } from "vitest";
import {
  WORKSHOP_PRODUCTION_HANDOFF,
  verifyWorkshopProductionHandoff,
} from "@/lib/workshop/handoff";

describe("workshop production handoff", () => {
  it("is deterministic, free-core compatible and stops before external writes", () => {
    const first = JSON.stringify(WORKSHOP_PRODUCTION_HANDOFF);
    const second = JSON.stringify(WORKSHOP_PRODUCTION_HANDOFF);
    expect(second).toBe(first);
    expect(WORKSHOP_PRODUCTION_HANDOFF.relay.freeCoreSufficient).toBe(true);
    expect(WORKSHOP_PRODUCTION_HANDOFF.relay.accountRequired).toBe(false);
    expect(WORKSHOP_PRODUCTION_HANDOFF.website.price.lookupKey).toBeNull();
    expect(WORKSHOP_PRODUCTION_HANDOFF.website.price.amountCents).toBeNull();
    expect(
      WORKSHOP_PRODUCTION_HANDOFF.motion.paidGenerationAuthorized
    ).toBe(false);
    expect(WORKSHOP_PRODUCTION_HANDOFF.decision.recommendation).toBe("revise");
    expect(WORKSHOP_PRODUCTION_HANDOFF.sources[0]?.contentHash).toBe(
      "d3722bf26ad08b281d2b62de78ea7cef510269d6003d7d7bf616265b0a062a62"
    );
    expect(first).not.toContain("/Users/");
  });

  it("matches the Motion v1 draft-job boundary used by the handoff", () => {
    const job = WORKSHOP_PRODUCTION_HANDOFF.motion.jobSeed;
    expect(job.schema_version).toBe(1);
    expect(job.job_id).toMatch(
      /^[a-z0-9]+(?:-[a-z0-9]+)*-[0-9]{8}t[0-9]{6}z-[a-f0-9]{4,8}$/
    );
    expect(job.source.source_paths.every((item) => item.startsWith("/"))).toBe(
      true
    );
    expect(job.state).toBe("draft");
    expect(job.route.operations).toEqual([]);
    expect(job.gates.map((gate) => gate.type)).toEqual([
      "brief-claims",
      "creative-direction",
    ]);
  });

  it("rejects a content mutation", () => {
    const tampered = structuredClone(WORKSHOP_PRODUCTION_HANDOFF);
    tampered.website.status = "awaiting-website-configuration";
    tampered.website.publicPromise = "Changed without a new hash";
    expect(() => verifyWorkshopProductionHandoff(tampered)).toThrow(
      "WorkshopProductionHandoffIntegrityError"
    );
  });
});
