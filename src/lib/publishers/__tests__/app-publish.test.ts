import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  deployments,
  publishTargets,
  userTableRows,
  userTables,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { loadGenerateRows, runDeployment, triggerAppPublish } from "../app-publish";

vi.mock("@/lib/apps/registry", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/apps/registry")>("@/lib/apps/registry");
  return {
    ...actual,
    getApp: vi.fn(),
  };
});

vi.mock("@/lib/publishers/registry", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/publishers/registry")>(
      "@/lib/publishers/registry"
    );
  return {
    ...actual,
    getPublisherAdapter: vi.fn(),
  };
});

import { getApp } from "@/lib/apps/registry";
import { getPublisherAdapter } from "@/lib/publishers/registry";

const APP_ID = "publish-app-test";
const TABLE_ID = "publish-table-test";
const TARGET_ID = "publish-target-test";

function mockApp() {
  vi.mocked(getApp).mockReturnValue({
    id: APP_ID,
    name: "Publish App",
    description: null,
    rootDir: "/tmp/publish-app-test",
    primitivesSummary: "",
    profileCount: 0,
    blueprintCount: 0,
    tableCount: 1,
    scheduleCount: 0,
    scheduleHuman: null,
    createdAt: 0,
    files: [],
    entitlement: null,
    manifest: {
      id: APP_ID,
      name: "Publish App",
      profiles: [],
      blueprints: [],
      tables: [{ id: TABLE_ID }],
      schedules: [],
      view: {
        kit: "auto",
        hideManifestPane: false,
        bindings: {
          generate: {
            generatorType: "static-site",
            table: TABLE_ID,
            siteTitle: "Publish App",
          },
          publish: { targetType: "github-pages" },
        },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  db.delete(deployments).where(eq(deployments.appId, APP_ID)).run();
  db.delete(publishTargets).where(eq(publishTargets.appId, APP_ID)).run();
  db.delete(userTableRows).where(eq(userTableRows.tableId, TABLE_ID)).run();
  db.delete(userTables).where(eq(userTables.id, TABLE_ID)).run();

  const now = new Date();
  db.insert(userTables)
    .values({
      id: TABLE_ID,
      name: "Website Sections",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(publishTargets)
    .values({
      id: TARGET_ID,
      appId: APP_ID,
      targetType: "github-pages",
      config: JSON.stringify({
        owner: "acme",
        repo: "site",
        githubToken: "ghp_secret1234",
      }),
      createdAt: now,
    })
    .run();
});

describe("loadGenerateRows", () => {
  it("parses listRows() JSON payloads before handing rows to a generator", async () => {
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-1",
        tableId: TABLE_ID,
        data: JSON.stringify({ kind: "hero", heading: "Launch", status: "published" }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await expect(loadGenerateRows(TABLE_ID)).resolves.toEqual([
      { kind: "hero", heading: "Launch", status: "published" },
    ]);
  });

  it("fails visibly when a persisted row has invalid JSON", async () => {
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-bad",
        tableId: TABLE_ID,
        data: "{not-json",
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    await expect(loadGenerateRows(TABLE_ID)).rejects.toMatchObject({
      code: "GENERATE_ROW_INVALID",
      message: expect.stringContaining("publish-row-bad"),
    });
  });
});

describe("runDeployment", () => {
  it("records a success deployment with artifact hash, URL, and commit", async () => {
    mockApp();
    const publish = vi.fn().mockResolvedValue({
      success: true,
      url: "https://acme.github.io/site/",
      commit: "abc123",
    });
    vi.mocked(getPublisherAdapter).mockReturnValue({
      targetType: "github-pages",
      testConnection: vi.fn(),
      publish,
    });
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-2",
        tableId: TABLE_ID,
        data: JSON.stringify({
          kind: "hero",
          heading: "Ship it",
          order: 1,
          status: "published",
        }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const { deployment } = triggerAppPublish(APP_ID, TARGET_ID);
    expect(deployment.status).toBe("pending");

    const finished = await runDeployment(deployment.id);
    expect(finished.status).toBe("success");
    expect(finished.url).toBe("https://acme.github.io/site/");
    expect(finished.commit).toBe("abc123");
    expect(finished.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(finished.error).toBeNull();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ entryPoint: "index.html" }),
      expect.objectContaining({ githubToken: "ghp_secret1234" })
    );
  });

  it("records a named failure instead of leaving the deployment pending", async () => {
    mockApp();
    vi.mocked(getPublisherAdapter).mockReturnValue({
      targetType: "github-pages",
      testConnection: vi.fn(),
      publish: vi.fn().mockResolvedValue({ success: false, error: "denied" }),
    });

    const { deployment } = triggerAppPublish(APP_ID, TARGET_ID);
    const finished = await runDeployment(deployment.id);
    expect(finished.status).toBe("failed");
    expect(finished.error).toBe("PUBLISH_FAILED: denied");
    expect(finished.finishedAt).toBeInstanceOf(Date);
  });
});
