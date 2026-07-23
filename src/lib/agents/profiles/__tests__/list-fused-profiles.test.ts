import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  FilesystemSkillDiscoveryError,
  listFusedProfiles,
} from "@/lib/agents/profiles/list-fused-profiles";
import {
  readFilesystemSkillDiagnostics,
  resetFilesystemSkillDiagnosticsForTests,
} from "@/lib/agents/profiles/filesystem-skill-diagnostics";

describe("listFusedProfiles", () => {
  let projectDir: string;
  let userSkillsDir: string;

  beforeEach(() => {
    resetFilesystemSkillDiagnosticsForTests();
    projectDir = mkdtempSync(join(tmpdir(), "ainative-skills-"));
    userSkillsDir = mkdtempSync(join(tmpdir(), "ainative-user-skills-"));
    mkdirSync(join(projectDir, ".claude", "skills"), { recursive: true });
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(userSkillsDir, { recursive: true, force: true });
  });

  function writeSkill(baseDir: string, name: string, frontmatter: string) {
    mkdirSync(join(baseDir, name), { recursive: true });
    writeFileSync(
      join(baseDir, name, "SKILL.md"),
      `---\n${frontmatter}\n---\n\nbody for ${name}\n`
    );
  }

  it("returns registry profiles when no filesystem skills exist", async () => {
    const result = await listFusedProfiles(projectDir, userSkillsDir);
    // Should contain at least one registry profile (builtin)
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => typeof p.id === "string")).toBe(true);
  });

  it("surfaces a project .claude/skills/<name> entry", async () => {
    writeSkill(
      join(projectDir, ".claude", "skills"),
      "my-project-skill",
      `name: my-project-skill\ndescription: Test project skill`
    );
    const result = await listFusedProfiles(projectDir, userSkillsDir);
    expect(result.some((p) => p.id === "my-project-skill")).toBe(true);
    const skill = result.find((p) => p.id === "my-project-skill")!;
    expect(skill.name).toBe("my-project-skill");
    expect(skill.description).toBe("Test project skill");
    expect(skill.origin).toBe("filesystem-project");
  });

  it("sets projectDir to the project root (not the skills subdirectory) on filesystem-project entries", async () => {
    writeSkill(
      join(projectDir, ".claude", "skills"),
      "my-scoped-skill",
      `name: my-scoped-skill\ndescription: Scoped`
    );
    const result = await listFusedProfiles(projectDir, userSkillsDir);
    const skill = result.find((p) => p.id === "my-scoped-skill")!;
    expect(skill.projectDir).toBe(projectDir);
    // Negative: must not be the .claude/skills subdirectory
    expect(skill.projectDir).not.toContain(".claude/skills");
  });

  it("surfaces a user ~/.claude/skills/<name> entry", async () => {
    writeSkill(
      userSkillsDir,
      "my-user-skill",
      `name: my-user-skill\ndescription: Test user skill`
    );
    const result = await listFusedProfiles(projectDir, userSkillsDir);
    expect(result.some((p) => p.id === "my-user-skill")).toBe(true);
    expect(
      result.find((p) => p.id === "my-user-skill")!.origin
    ).toBe("filesystem-user");
  });

  it("dedupes by id — registry profile wins over filesystem skill with same id", async () => {
    // "general" is a known builtin registry profile id; write a filesystem
    // skill with the same id to force a collision.
    writeSkill(
      join(projectDir, ".claude", "skills"),
      "general",
      `name: general\ndescription: This should be overridden by registry`
    );
    const result = await listFusedProfiles(projectDir, userSkillsDir);
    const entries = result.filter((p) => p.id === "general");
    expect(entries).toHaveLength(1);
    // Registry description should win (not the filesystem-overridden one)
    expect(entries[0].description).not.toBe("This should be overridden by registry");
  });

  it("logs and skips a malformed SKILL.md (no name field in frontmatter)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeSkill(
      join(projectDir, ".claude", "skills"),
      "broken-skill",
      `description: Missing name field — broken`
    );
    const result = await listFusedProfiles(projectDir, userSkillsDir);
    expect(result.some((p) => p.id === "broken-skill")).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("1 malformed");
    expect(String(warnSpy.mock.calls[0][0])).not.toContain(projectDir);
    warnSpy.mockRestore();
  });

  it("loads a valid directory symlink and skips a dangling symlink", async () => {
    const target = join(projectDir, "valid-skill-target");
    writeSkill(
      projectDir,
      "valid-skill-target",
      "name: linked-skill\ndescription: Linked",
    );
    symlinkSync(
      target,
      join(userSkillsDir, "linked-skill"),
      "dir",
    );
    symlinkSync(
      join(projectDir, "missing-target"),
      join(userSkillsDir, "dangling-skill"),
      "dir",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await listFusedProfiles(projectDir, userSkillsDir);

    expect(result.some((profile) => profile.id === "linked-skill")).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const reports = readFilesystemSkillDiagnostics();
    expect(
      reports.flatMap((report) => report.issues),
    ).toEqual([
      expect.objectContaining({
        kind: "unavailable-entry",
        path: join(userSkillsDir, "dangling-skill"),
      }),
    ]);
    warnSpy.mockRestore();
  });

  it("skips unreadable and unrelated entries while preserving valid skills", async () => {
    writeSkill(
      userSkillsDir,
      "valid-skill",
      "name: valid-skill\ndescription: Valid",
    );
    mkdirSync(join(userSkillsDir, "unreadable-skill", "SKILL.md"), {
      recursive: true,
    });
    writeFileSync(join(userSkillsDir, "ordinary-file"), "not a skill");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await listFusedProfiles(projectDir, userSkillsDir);

    expect(result.some((profile) => profile.id === "valid-skill")).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain("1 unreadable");
    warnSpy.mockRestore();
  });

  it("deduplicates the same privacy-safe warning within one minute", async () => {
    writeSkill(
      userSkillsDir,
      "broken-skill",
      "description: Missing name",
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await listFusedProfiles(projectDir, userSkillsDir);
    await listFusedProfiles(projectDir, userSkillsDir);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).not.toContain(userSkillsDir);
    warnSpy.mockRestore();
  });

  it("throws a named error when an existing skills root cannot be scanned", async () => {
    const notDirectory = join(projectDir, "not-a-directory");
    writeFileSync(notDirectory, "file");

    await expect(
      listFusedProfiles(projectDir, notDirectory),
    ).rejects.toMatchObject({
      name: "FilesystemSkillDiscoveryError",
      code: "FILESYSTEM_SKILL_SCANNER_FAILED",
      skillsDir: notDirectory,
      scope: "filesystem-user",
    } satisfies Partial<FilesystemSkillDiscoveryError>);
    expect(readFilesystemSkillDiagnostics()).toEqual([
      expect.objectContaining({
        root: notDirectory,
        loadedCount: 0,
        issues: [
          expect.objectContaining({ kind: "scanner-failure" }),
        ],
      }),
    ]);
  });

  it("returns an empty-safe result when projectDir does not exist", async () => {
    const result = await listFusedProfiles("/nonexistent/path", userSkillsDir);
    // Should still return registry + user skills, no throw
    expect(Array.isArray(result)).toBe(true);
  });
});
