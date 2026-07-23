import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "../route";
import {
  recordFilesystemSkillDiagnostics,
  resetFilesystemSkillDiagnosticsForTests,
} from "@/lib/agents/profiles/filesystem-skill-diagnostics";

describe("filesystem skill diagnostics route", () => {
  beforeEach(() => {
    resetFilesystemSkillDiagnosticsForTests();
    recordFilesystemSkillDiagnostics({
      scannedAt: "2026-07-23T08:00:00.000Z",
      root: "/Users/customer/.claude/skills",
      scope: "filesystem-user",
      loadedCount: 2,
      issues: [
        {
          kind: "unavailable-entry",
          scope: "filesystem-user",
          path: "/Users/customer/.claude/skills/dangling",
          reason: "ENOENT: missing target",
        },
      ],
    });
  });

  it("returns redacted aggregate diagnostics by default", async () => {
    const response = await GET(
      new Request("http://localhost/api/diagnostics/filesystem-skills"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      includePaths: false,
      reports: [
        {
          scannedAt: "2026-07-23T08:00:00.000Z",
          scope: "filesystem-user",
          loadedCount: 2,
          issueCount: 1,
          counts: { "unavailable-entry": 1 },
        },
      ],
    });
    expect(JSON.stringify(body)).not.toContain("/Users/customer");
  });

  it("includes local paths only after an explicit diagnostics request", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/diagnostics/filesystem-skills?includePaths=1",
      ),
    );
    const body = await response.json();

    expect(body.includePaths).toBe(true);
    expect(body.reports[0]).toMatchObject({
      root: "/Users/customer/.claude/skills",
      issues: [
        {
          path: "/Users/customer/.claude/skills/dangling",
          reason: "ENOENT: missing target",
        },
      ],
    });
  });

  it("rejects an invalid includePaths value", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/diagnostics/filesystem-skills?includePaths=yes",
      ),
    );

    expect(response.status).toBe(400);
  });
});
