import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppPublishPanel } from "../app-publish-panel";

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const fetchSpy = vi.fn();

const target = {
  id: "target-1",
  appId: "app-1",
  targetType: "github-pages",
  config: JSON.stringify({
    owner: "acme",
    repo: "site",
    branch: "gh-pages",
    githubToken: "****1234",
  }),
  createdAt: "2026-07-07T00:00:00.000Z",
};

const siteSettingsResponse = {
  settings: {
    templateId: "relay-default",
    theme: "calm",
    density: "comfortable",
    heroLayout: "split",
    accent: "tide",
    showCtas: true,
    sectionStyle: "cards",
  },
  defaults: {
    templateId: "relay-default",
    theme: "calm",
    density: "comfortable",
    heroLayout: "split",
    accent: "tide",
    showCtas: true,
    sectionStyle: "cards",
  },
  templates: [
    {
      id: "relay-default",
      version: "0.1.0",
      name: "Relay Default",
      description: "Default template",
      provenance: {
        source: "orionfold-bundled",
        synthetic: true,
        note: "Synthetic fixture",
      },
      supportedSectionKinds: ["hero", "features", "text", "cta"],
    },
    {
      id: "editorial-proof",
      version: "0.1.0",
      name: "Editorial Proof",
      description: "Editorial template",
      provenance: {
        source: "orionfold-bundled",
        synthetic: true,
        note: "Synthetic fixture",
      },
      supportedSectionKinds: ["hero", "features", "text", "cta"],
    },
  ],
};

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function created(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

function accepted(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchSpy.mockReset();
  toastSuccess.mockClear();
  toastError.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPanel() {
  return render(
    <AppPublishPanel
      appId="app-1"
      targetType="github-pages"
      generatorType="static-site"
      sourceTable="web-sections"
    />
  );
}

describe("AppPublishPanel", () => {
  it("lists masked targets and disables publish while a deployment is active", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(
        ok([
          {
            id: "dep-1",
            appId: "app-1",
            targetId: "target-1",
            status: "publishing",
            url: null,
            commit: null,
            artifactHash: null,
            startedAt: "2026-07-07T00:00:00.000Z",
            finishedAt: null,
            error: null,
          },
        ])
      )
      .mockResolvedValueOnce(ok(siteSettingsResponse));

    renderPanel();

    expect(await screen.findByText("acme/site")).toBeInTheDocument();
    expect(screen.getByText("****1234")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publishing/i })).toBeDisabled();
  });

  it("creates a target, selects it, and never echoes the raw token", async () => {
    const createdTarget = {
      ...target,
      id: "target-2",
      config: JSON.stringify({ owner: "orion", repo: "launch", branch: "main", githubToken: "****5678" }),
    };
    fetchSpy
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(siteSettingsResponse))
      .mockResolvedValueOnce(created(createdTarget));

    renderPanel();
    fireEvent.change(await screen.findByLabelText(/Owner/i), { target: { value: "orion" } });
    fireEvent.change(screen.getByLabelText(/Repo/i), { target: { value: "launch" } });
    fireEvent.change(screen.getByLabelText(/Branch/i), { target: { value: "main" } });
    fireEvent.change(screen.getByLabelText(/GitHub token/i), { target: { value: "ghp_secret5678" } });
    fireEvent.click(screen.getByRole("button", { name: /Save target/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Publish target saved"));
    expect(fetchSpy).toHaveBeenLastCalledWith(
      "/api/apps/app-1/publish-targets",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("ghp_secret5678"),
      })
    );
    expect(screen.getByText("orion/launch")).toBeInTheDocument();
    expect(screen.getByText("****5678")).toBeInTheDocument();
    expect(screen.queryByText("ghp_secret5678")).toBeNull();
  });

  it("tests a target and surfaces a failed test inline", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(siteSettingsResponse))
      .mockResolvedValueOnce(ok({ testStatus: "failed", error: "GitHub repo check failed: 404" }));

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Test/i }));

    expect(await screen.findByText("GitHub repo check failed: 404")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("GitHub repo check failed: 404");
  });

  it("deletes a target after confirmation and clears its deployment rows", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(
        ok([
          {
            id: "dep-target-1",
            appId: "app-1",
            targetId: "target-1",
            status: "success",
            url: "https://acme.github.io/site/",
            finalUrl: null,
            commit: "abc123",
            artifactHash: "hash",
            startedAt: "2026-07-07T00:00:00.000Z",
            finishedAt: "2026-07-07T00:00:01.000Z",
            error: null,
          },
        ])
      )
      .mockResolvedValueOnce(ok(siteSettingsResponse))
      .mockResolvedValueOnce(ok({ id: "target-1", deletedDeployments: 1 }))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([]));

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Delete/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Delete target/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Publish target deleted"));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/apps/app-1/publish-targets/target-1",
      expect.objectContaining({ method: "DELETE" })
    );
    expect(screen.queryByText("acme/site")).toBeNull();
  });

  it("blocks deleting a target while that target has an active deployment", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(
        ok([
          {
            id: "dep-active",
            appId: "app-1",
            targetId: "target-1",
            status: "publishing",
            url: null,
            finalUrl: null,
            commit: null,
            artifactHash: null,
            startedAt: "2026-07-07T00:00:00.000Z",
            finishedAt: null,
            error: null,
          },
        ])
      )
      .mockResolvedValueOnce(ok(siteSettingsResponse));

    renderPanel();

    const deleteButton = await screen.findByRole("button", { name: /Delete/i });
    expect(deleteButton).toBeDisabled();
    expect(
      screen.getByText("Finish the active deployment before deleting this target.")
    ).toBeInTheDocument();
  });

  it("starts a publish and shows failed deployment errors from polling", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(siteSettingsResponse))
      .mockResolvedValueOnce(
        accepted({
          deployment: {
            id: "dep-2",
            appId: "app-1",
            targetId: "target-1",
            status: "pending",
            url: null,
            commit: null,
            artifactHash: null,
            startedAt: "2026-07-07T00:00:00.000Z",
            finishedAt: null,
            error: null,
          },
        })
      )
      .mockResolvedValueOnce(
        ok([
          {
            id: "dep-2",
            appId: "app-1",
            targetId: "target-1",
            status: "failed",
            url: null,
            commit: null,
            artifactHash: null,
            startedAt: "2026-07-07T00:00:00.000Z",
            finishedAt: "2026-07-07T00:00:01.000Z",
            error: "PUBLISH_FAILED: denied",
          },
        ])
      );

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /^Publish$/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Publish started"));
    await waitFor(() => {
      expect(screen.getAllByText("PUBLISH_FAILED: denied")).toHaveLength(2);
    });
  });

  it("generates a preview and publishes that artifact id", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const preview = {
      artifactId: "artifact-1",
      url: "/api/apps/app-1/previews/artifact-1",
      hash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      createdAt: "2026-07-07T00:00:00.000Z",
      expiresAt: "2999-07-07T00:00:00.000Z",
    };
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(siteSettingsResponse))
      .mockResolvedValueOnce(created(preview))
      .mockResolvedValueOnce(ok({ ...preview, stale: false }))
      .mockResolvedValueOnce(
        accepted({
          deployment: {
            id: "dep-preview",
            appId: "app-1",
            targetId: "target-1",
            status: "pending",
            url: null,
            commit: null,
            artifactHash: null,
            startedAt: "2026-07-07T00:00:00.000Z",
            finishedAt: null,
            error: null,
          },
        })
      )
      .mockResolvedValueOnce(
        ok([
          {
            id: "dep-preview",
            appId: "app-1",
            targetId: "target-1",
            status: "success",
            url: "https://acme.github.io/site/",
            commit: "abc123",
            artifactHash: preview.hash,
            startedAt: "2026-07-07T00:00:00.000Z",
            finishedAt: "2026-07-07T00:00:01.000Z",
            error: null,
          },
        ])
      );

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /^Preview$/i }));

    expect(await screen.findByText("Local preview")).toBeInTheDocument();
    expect(screen.getByText("abcdef123456")).toBeInTheDocument();
    expect(screen.getByTitle("Local generated site preview")).toHaveAttribute("src", preview.url);
    expect(screen.getByRole("link", { name: /View without chrome/i })).toHaveAttribute(
      "href",
      preview.url
    );
    expect(openSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Publish this preview/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Preview publish started"));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/apps/app-1/publish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ targetId: "target-1", artifactId: "artifact-1" }),
      })
    );
    openSpy.mockRestore();
  });

  it("marks generated previews stale and blocks exact-preview publish", async () => {
    const preview = {
      artifactId: "artifact-stale",
      url: "/api/apps/app-1/previews/artifact-stale",
      hash: "123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890",
      createdAt: "2026-07-07T00:00:00.000Z",
      expiresAt: "2999-07-07T00:00:00.000Z",
    };
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(siteSettingsResponse))
      .mockResolvedValueOnce(created(preview))
      .mockResolvedValueOnce(ok({ ...preview, stale: true }));

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /^Preview$/i }));

    expect(await screen.findByText("Stale")).toBeInTheDocument();
    expect(
      screen.getByText("Source rows changed. Generate a new preview before publishing.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Publish this preview/i })).toBeDisabled();
  });

  it("saves site controls and marks an existing preview stale", async () => {
    const preview = {
      artifactId: "artifact-controls",
      url: "/api/apps/app-1/previews/artifact-controls",
      hash: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      createdAt: "2026-07-07T00:00:00.000Z",
      expiresAt: "2999-07-07T00:00:00.000Z",
    };
    const savedResponse = {
      ...siteSettingsResponse,
      settings: { ...siteSettingsResponse.settings, showCtas: false },
    };
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok(siteSettingsResponse))
      .mockResolvedValueOnce(created(preview))
      .mockResolvedValueOnce(ok({ ...preview, stale: false }))
      .mockResolvedValueOnce(ok(savedResponse));

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /^Preview$/i }));
    expect(await screen.findByText("Fresh")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /Show CTAs/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save controls/i }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Site controls saved"));
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/apps/app-1/site-settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ ...siteSettingsResponse.settings, showCtas: false }),
      })
    );
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });
});
