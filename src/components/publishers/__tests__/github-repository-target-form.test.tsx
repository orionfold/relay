import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GitHubRepositoryTargetForm } from "../github-repository-target-form";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitHubRepositoryTargetForm", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("directs a disconnected user to the one shared Settings connection", async () => {
    fetchMock.mockResolvedValueOnce(json({ connected: false, login: null }));
    render(
      <GitHubRepositoryTargetForm
        appId="app-1"
        targetType="github-repo"
        defaultBranch="main"
        title="Add repository"
        onCreated={vi.fn()}
      />
    );
    expect(await screen.findByRole("link", { name: /Open GitHub settings/i }))
      .toHaveAttribute("href", "/settings#settings-github");
  });

  it("creates a credential-free target using the shared connection", async () => {
    const onCreated = vi.fn();
    fetchMock
      .mockResolvedValueOnce(json({ connected: true, login: "maker" }))
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({
        id: "target-1",
        appId: "app-1",
        targetType: "github-repo",
        config: JSON.stringify({ owner: "maker", repo: "pack", branch: "main" }),
        createdAt: "2026-07-11T00:00:00.000Z",
      }, 201));

    render(
      <GitHubRepositoryTargetForm
        appId="app-1"
        targetType="github-repo"
        defaultBranch="main"
        allowDirectory
        title="Add repository"
        onCreated={onCreated}
      />
    );

    fireEvent.change(await screen.findByLabelText("Owner"), { target: { value: "maker" } });
    fireEvent.change(screen.getByLabelText("Repository name"), { target: { value: "pack" } });
    fireEvent.click(screen.getByRole("button", { name: /Save repository/i }));

    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({
      targetType: "github-repo",
      config: { owner: "maker", repo: "pack", branch: "main", directory: "" },
    }));
    expect(String(init.body)).not.toContain("token");
  });
});
