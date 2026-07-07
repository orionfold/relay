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
      );

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
      .mockResolvedValueOnce(ok({ testStatus: "failed", error: "GitHub repo check failed: 404" }));

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /Test/i }));

    expect(await screen.findByText("GitHub repo check failed: 404")).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith("GitHub repo check failed: 404");
  });

  it("starts a publish and shows failed deployment errors from polling", async () => {
    fetchSpy
      .mockResolvedValueOnce(ok([target]))
      .mockResolvedValueOnce(ok([]))
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
});
