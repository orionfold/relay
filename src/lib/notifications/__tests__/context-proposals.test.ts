import { describe, expect, it } from "vitest";

import { resolveContextProposalProfileId } from "@/lib/notifications/context-proposals";

describe("resolveContextProposalProfileId", () => {
  it("prefers the profile id recorded in toolInput", () => {
    expect(
      resolveContextProposalProfileId(
        { profileId: "reading-radar/reader-coach" },
        "stale-display-name"
      )
    ).toBe("reading-radar/reader-coach");
  });

  it("falls back to toolName when toolInput carries no profile id", () => {
    expect(resolveContextProposalProfileId({ additions: "..." }, "general")).toBe(
      "general"
    );
    expect(resolveContextProposalProfileId(null, "general")).toBe("general");
  });

  it("returns null when neither names a profile", () => {
    expect(resolveContextProposalProfileId(null, null)).toBeNull();
    expect(resolveContextProposalProfileId({}, null)).toBeNull();
    expect(resolveContextProposalProfileId(undefined, undefined)).toBeNull();
  });

  it("treats an empty string as no profile rather than a usable id", () => {
    expect(resolveContextProposalProfileId({ profileId: "" }, "")).toBeNull();
    expect(resolveContextProposalProfileId({ profileId: "" }, "general")).toBe(
      "general"
    );
  });

  it("ignores a non-string profileId", () => {
    expect(resolveContextProposalProfileId({ profileId: 42 }, "general")).toBe(
      "general"
    );
  });
});
