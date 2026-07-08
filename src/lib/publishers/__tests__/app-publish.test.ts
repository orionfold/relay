import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  deployments,
  publishTargets,
  settings,
  userTableRows,
  userTables,
} from "@/lib/db/schema";
import { setAppStaticSiteSettings } from "@/lib/generators/app-static-site-settings";
import { staticSiteSettingsKey } from "@/lib/generators/static-site-settings";
import { eq } from "drizzle-orm";
import {
  createAppPreview,
  deletePublishTarget,
  getAppPreviewStatus,
  loadGenerateRows,
  runDeployment,
  triggerAppPublish,
} from "../app-publish";
import { loadPreviewArtifact } from "../preview-store";

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
  db.delete(settings).where(eq(settings.key, staticSiteSettingsKey(APP_ID))).run();
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

describe("createAppPreview", () => {
  it("stores a local preview artifact and returns a browsable preview URL", async () => {
    mockApp();
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-preview",
        tableId: TABLE_ID,
        data: JSON.stringify({
          kind: "hero",
          heading: "Preview me",
          status: "published",
        }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const preview = await createAppPreview(APP_ID);
    expect(preview.artifactId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(preview.url).toBe(
      `/api/apps/${encodeURIComponent(APP_ID)}/previews/${encodeURIComponent(preview.artifactId)}`
    );
    expect(preview.hash).toMatch(/^[a-f0-9]{64}$/);

    const stored = await loadPreviewArtifact(APP_ID, preview.artifactId);
    expect(String(stored.artifact.files[0]!.content)).toContain("Preview me");
    expect(stored.metadata.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.metadata.generatorConfig).toMatchObject({
      siteTitle: "Publish App",
      staticSiteSettings: {
        templateId: "relay-default",
        theme: "calm",
        density: "comfortable",
        heroLayout: "split",
        accent: "tide",
        showCtas: true,
        sectionStyle: "cards",
      },
      staticSiteTemplate: {
        id: "relay-default",
        provenance: { source: "orionfold-bundled", synthetic: true },
      },
    });
  });
});

describe("getAppPreviewStatus", () => {
  it("marks an existing preview stale when source rows change", async () => {
    mockApp();
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-preview-status",
        tableId: TABLE_ID,
        data: JSON.stringify({
          kind: "hero",
          heading: "Before",
          status: "published",
        }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const preview = await createAppPreview(APP_ID);
    await expect(getAppPreviewStatus(APP_ID, preview.artifactId)).resolves.toMatchObject({
      artifactId: preview.artifactId,
      stale: false,
    });

    db.update(userTableRows)
      .set({
        data: JSON.stringify({
          kind: "hero",
          heading: "After",
          status: "published",
        }),
        updatedAt: new Date(),
      })
      .where(eq(userTableRows.id, "publish-row-preview-status"))
      .run();

    await expect(getAppPreviewStatus(APP_ID, preview.artifactId)).resolves.toMatchObject({
      artifactId: preview.artifactId,
      stale: true,
    });
  });

  it("marks an existing preview stale when static-site settings change", async () => {
    mockApp();
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-preview-settings-status",
        tableId: TABLE_ID,
        data: JSON.stringify({
          kind: "hero",
          heading: "Before",
          status: "published",
        }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const preview = await createAppPreview(APP_ID);
    await expect(getAppPreviewStatus(APP_ID, preview.artifactId)).resolves.toMatchObject({
      artifactId: preview.artifactId,
      stale: false,
    });

    await setAppStaticSiteSettings(APP_ID, {
      templateId: "editorial-proof",
      theme: "contrast",
      density: "compact",
      heroLayout: "stacked",
      accent: "indigo",
      showCtas: false,
      sectionStyle: "ruled",
    });

    await expect(getAppPreviewStatus(APP_ID, preview.artifactId)).resolves.toMatchObject({
      artifactId: preview.artifactId,
      stale: true,
    });
  });
});

describe("deletePublishTarget", () => {
  it("removes the target and finished deployment rows in FK-safe order", () => {
    mockApp();
    const now = new Date();
    db.insert(deployments)
      .values({
        id: "dep-delete-finished",
        appId: APP_ID,
        targetId: TARGET_ID,
        status: "success",
        url: "https://acme.github.io/site/",
        startedAt: now,
        finishedAt: now,
      })
      .run();

    expect(deletePublishTarget(APP_ID, TARGET_ID)).toEqual({
      id: TARGET_ID,
      deletedDeployments: 1,
    });
    expect(db.select().from(deployments).where(eq(deployments.appId, APP_ID)).all()).toEqual([]);
    expect(db.select().from(publishTargets).where(eq(publishTargets.appId, APP_ID)).all()).toEqual([]);
  });

  it("refuses to delete a target with an active deployment", () => {
    mockApp();
    db.insert(deployments)
      .values({
        id: "dep-delete-active",
        appId: APP_ID,
        targetId: TARGET_ID,
        status: "publishing",
        startedAt: new Date(),
      })
      .run();

    expect(() => deletePublishTarget(APP_ID, TARGET_ID)).toThrow(
      "Publish target has an active deployment; wait for it to finish before deleting"
    );
    expect(db.select().from(publishTargets).where(eq(publishTargets.id, TARGET_ID)).get()).toBeTruthy();
    expect(db.select().from(deployments).where(eq(deployments.id, "dep-delete-active")).get()).toBeTruthy();
  });
});

describe("runDeployment", () => {
  it("records a success deployment with artifact hash, URL, and commit", async () => {
    mockApp();
    const publish = vi.fn().mockResolvedValue({
      success: true,
      url: "https://acme.github.io/site/",
      finalUrl: "https://www.acme.test/",
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
    expect(finished.finalUrl).toBe("https://www.acme.test/");
    expect(finished.commit).toBe("abc123");
    expect(finished.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.parse(finished.generatorConfig ?? "{}")).toMatchObject({
      staticSiteSettings: { theme: "calm" },
    });
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

  it("publishes the exact stored preview artifact when artifactId is supplied", async () => {
    mockApp();
    const publish = vi.fn().mockResolvedValue({
      success: true,
      url: "https://acme.github.io/site/",
      commit: "preview123",
    });
    vi.mocked(getPublisherAdapter).mockReturnValue({
      targetType: "github-pages",
      testConnection: vi.fn(),
      publish,
    });
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-preview-publish",
        tableId: TABLE_ID,
        data: JSON.stringify({
          kind: "hero",
          heading: "Exact preview",
          status: "published",
        }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const preview = await createAppPreview(APP_ID);
    const { deployment } = triggerAppPublish(APP_ID, TARGET_ID);
    const finished = await runDeployment(deployment.id, preview.artifactId);

    expect(finished.status).toBe("success");
    expect(finished.artifactHash).toBe(preview.hash);
    expect(JSON.parse(finished.generatorConfig ?? "{}")).toMatchObject({
      staticSiteSettings: { theme: "calm" },
    });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ hash: preview.hash }),
      expect.objectContaining({ githubToken: "ghp_secret1234" })
    );
  });

  it("refuses to publish a preview when the source rows changed", async () => {
    mockApp();
    vi.mocked(getPublisherAdapter).mockReturnValue({
      targetType: "github-pages",
      testConnection: vi.fn(),
      publish: vi.fn().mockResolvedValue({ success: true }),
    });
    const now = new Date();
    db.insert(userTableRows)
      .values({
        id: "publish-row-preview-stale",
        tableId: TABLE_ID,
        data: JSON.stringify({
          kind: "hero",
          heading: "Before",
          status: "published",
        }),
        position: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const preview = await createAppPreview(APP_ID);
    db.update(userTableRows)
      .set({
        data: JSON.stringify({
          kind: "hero",
          heading: "After",
          status: "published",
        }),
        updatedAt: new Date(),
      })
      .where(eq(userTableRows.id, "publish-row-preview-stale"))
      .run();

    const { deployment } = triggerAppPublish(APP_ID, TARGET_ID);
    const finished = await runDeployment(deployment.id, preview.artifactId);
    expect(finished.status).toBe("failed");
    expect(finished.error).toBe(
      "PREVIEW_STALE: Preview artifact is stale; generate a new preview before publishing"
    );
  });
});
