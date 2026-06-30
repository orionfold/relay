import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/agents/profiles/list-fused-profiles", () => ({
  listFusedProfiles: vi.fn(async (projectDir: string | null) =>
    [
      {
        id: "general",
        name: "General",
        description: "Reg",
        domain: "general",
        tags: [],
      },
      projectDir
        ? {
            id: "project-only",
            name: "Project Only",
            description: "Proj",
            domain: "skill",
            tags: [],
            origin: "filesystem-project",
          }
        : null,
    ].filter(Boolean)
  ),
}));

const createProfileMock = vi.fn();
const createPromotedProfileMock = vi.fn();
vi.mock("@/lib/agents/profiles/registry", () => ({
  createProfile: (...args: unknown[]) => createProfileMock(...args),
  createPromotedProfile: (...args: unknown[]) => createPromotedProfileMock(...args),
  getProfile: vi.fn(() => undefined),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
}));

const ensureAppProjectMock = vi.fn(async (appId: string) => ({
  projectId: appId,
  created: true,
}));
const upsertAppManifestMock = vi.fn();
vi.mock("@/lib/apps/compose-integration", () => ({
  extractAppIdFromArtifactId: (id: string | null | undefined) => {
    if (!id) return null;
    const idx = id.indexOf("--");
    if (idx <= 0) return null;
    return id.slice(0, idx);
  },
  ensureAppProject: (...args: unknown[]) => ensureAppProjectMock(...(args as [string])),
  upsertAppManifest: (...args: unknown[]) => upsertAppManifestMock(...args),
}));

describe("list_profiles chat tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns fused profiles when called with a projectDir", async () => {
    const { getListProfilesTool } = await import("@/lib/chat/tools/profile-tools");
    const tool = getListProfilesTool("/fake/project");
    const result = await tool.handler({});
    // ok() wraps data as MCP content — parse the JSON text back out
    const text = result.content[0].text;
    const list = JSON.parse(text) as { id: string }[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((p) => p.id === "project-only")).toBe(true);
  });

  it("returns registry-only profiles when projectDir is null", async () => {
    const { getListProfilesTool } = await import("@/lib/chat/tools/profile-tools");
    const tool = getListProfilesTool(null);
    const result = await tool.handler({});
    const text = result.content[0].text;
    const list = JSON.parse(text) as { id: string }[];
    expect(list.every((p) => p.id !== "project-only")).toBe(true);
  });
});

describe("create_profile compose-aware routing", () => {
  const baseConfig = {
    id: "",
    name: "Test",
    version: "1.0.0",
    domain: "personal" as const,
    tags: [],
  };
  const skillMd = "# Test\n\nSystem prompt.";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function getCreateProfileTool() {
    const { profileTools } = await import("@/lib/chat/tools/profile-tools");
    const tools = profileTools({ projectId: null, projectDir: null });
    const tool = tools.find((t) => t.name === "create_profile");
    if (!tool) throw new Error("create_profile tool missing");
    return tool;
  }

  it("routes to createProfile (global ~/.claude/skills/) for standalone ids", async () => {
    const tool = await getCreateProfileTool();
    const result = await tool.handler({
      config: { ...baseConfig, id: "my-standalone-agent" },
      skillMd,
    });
    expect(createProfileMock).toHaveBeenCalledTimes(1);
    expect(createPromotedProfileMock).not.toHaveBeenCalled();
    expect(ensureAppProjectMock).not.toHaveBeenCalled();
    expect(upsertAppManifestMock).not.toHaveBeenCalled();
    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.appId).toBeUndefined();
  });

  it("routes to createPromotedProfile + manifest upsert for compose ids", async () => {
    const tool = await getCreateProfileTool();
    const result = await tool.handler({
      config: { ...baseConfig, id: "reading-radar--manager", name: "Reading Radar Manager" },
      skillMd,
    });
    expect(createProfileMock).not.toHaveBeenCalled();
    expect(createPromotedProfileMock).toHaveBeenCalledTimes(1);
    expect(ensureAppProjectMock).toHaveBeenCalledWith("reading-radar");
    expect(upsertAppManifestMock).toHaveBeenCalledTimes(1);
    const manifestCall = upsertAppManifestMock.mock.calls[0];
    expect(manifestCall[0]).toBe("reading-radar");
    expect(manifestCall[1]).toMatchObject({
      kind: "profile",
      id: "reading-radar--manager",
    });

    const text = result.content[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.appId).toBe("reading-radar");
  });

  it("never writes to the global skills dir during compose (prevents profile data-dir leak)", async () => {
    const tool = await getCreateProfileTool();
    await tool.handler({
      config: { ...baseConfig, id: "weekly-reading-list--synthesizer" },
      skillMd,
    });
    // The critical assertion: createProfile (which writes to ~/.claude/skills/)
    // must NOT be invoked. createPromotedProfile writes to RELAY_DATA_DIR.
    expect(createProfileMock).not.toHaveBeenCalled();
  });
});
