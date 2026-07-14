import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/db/schema", () => ({
  deployments: {},
  publishTargets: { id: "id", appId: "appId" },
}));
vi.mock("@/lib/db", () => ({ db: { select: state.select } }));
vi.mock("@/lib/apps/registry", () => ({ getApp: vi.fn() }));
vi.mock("@/lib/packs/app-exporter", () => ({ buildAppPackArtifact: vi.fn() }));
vi.mock("../registry", () => ({ getPublisherAdapter: vi.fn() }));

import { getApp } from "@/lib/apps/registry";
import { triggerPackPublish } from "../pack-publish";

describe("triggerPackPublish app ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuses an installed pack before reading repository targets or creating a deployment", () => {
    vi.mocked(getApp).mockReturnValue({ origin: "installed-pack" } as never);

    expect(() =>
      triggerPackPublish("installed-pack", "target-1", {
        expectedHash: "a".repeat(64),
      })
    ).toThrow(
      expect.objectContaining({
        code: "PACK_PUBLISH_FORBIDDEN",
        statusCode: 403,
        message:
          "Pack repository publishing is available only for user-created app shells.",
      })
    );
    expect(state.select).not.toHaveBeenCalled();
  });
});
