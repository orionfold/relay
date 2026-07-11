import { describe, it, expect } from "vitest";
import { classifyMessage } from "../classifier";
import type { PlannerContext } from "../types";

const ctx: PlannerContext = { projectId: null, history: [] };

describe("classifyMessage — compose path", () => {
  it("routes build-me-a-pack with repository output through composition", () => {
    const verdict = classifyMessage(
      "Build me a pack to track renewals and save it in my private GitHub repo",
      { projectId: null, history: [] }
    );
    expect(verdict.kind).toBe("compose");
    if (verdict.kind === "compose") {
      expect(verdict.plan.packIntent).toBe(true);
      expect(verdict.plan.repositoryPublishIntent).toBe(true);
    }
  });
  it("classifies 'build me a weekly portfolio check-in' as compose", () => {
    const v = classifyMessage("build me a weekly portfolio check-in", ctx);
    expect(v.kind).toBe("compose");
    if (v.kind !== "compose") return;
    expect(v.plan.profileId).toBe("wealth-manager");
    expect(v.plan.blueprintId).toBe("investment-research");
  });

  it("classifies 'create an app for reading list tracking' as compose → researcher", () => {
    const v = classifyMessage("create an app for reading list tracking", ctx);
    expect(v.kind).toBe("compose");
    if (v.kind !== "compose") return;
    expect(v.plan.profileId).toBe("researcher");
  });

  it("is case-insensitive", () => {
    const v = classifyMessage("BUILD ME a portfolio app", ctx);
    expect(v.kind).toBe("compose");
  });

  it("returns a primitive_matched plan when a PRIMITIVE_MAP keyword hits", () => {
    const v = classifyMessage("build me a portfolio app", ctx);
    expect(v.kind).toBe("compose");
    if (v.kind !== "compose") return;
    expect(v.plan.kind).toBe("primitive_matched");
    expect(v.plan.profileId).toBe("wealth-manager");
  });

  it("returns a generic compose plan when COMPOSE_TRIGGERS matches but no PRIMITIVE_MAP entry does", () => {
    const v = classifyMessage("build me a habit tracker app", ctx);
    expect(v.kind).toBe("compose");
    if (v.kind !== "compose") return;
    expect(v.plan.kind).toBe("generic");
    expect(v.plan.profileId).toBeUndefined();
    expect(v.plan.blueprintId).toBeUndefined();
    expect(v.plan.rationale).toMatch(/build me/);
  });

  it("compose+noun with app-intent routes to compose generic and carries the noun", () => {
    const v = classifyMessage("build me a github habit tracker", ctx);
    expect(v.kind).toBe("compose");
    if (v.kind !== "compose") return;
    expect(v.plan.kind).toBe("generic");
    expect(v.plan.integrationNoun).toBe("github");
  });

  it("compose+noun with app-intent + primitive match carries noun on primitive plan", () => {
    const v = classifyMessage("build me a notion portfolio app", ctx);
    expect(v.kind).toBe("compose");
    if (v.kind !== "compose") return;
    expect(v.plan.kind).toBe("primitive_matched");
    expect(v.plan.profileId).toBe("wealth-manager");
    expect(v.plan.integrationNoun).toBe("notion");
  });
});

describe("classifyMessage — scaffold path", () => {
  it("classifies 'I need a tool that pulls my GitHub issues' as scaffold", () => {
    const v = classifyMessage(
      "I need a tool that pulls my GitHub issues",
      ctx
    );
    expect(v.kind).toBe("scaffold");
    if (v.kind !== "scaffold") return;
    expect(v.plan.plugin.id).toMatch(/github/);
    expect(v.plan.plugin.language).toBe("python");
    expect(v.plan.plugin.transport).toBe("stdio");
    expect(v.plan.plugin.tools.length).toBeGreaterThan(0);
  });

  it("classifies 'integrate with Jira' as scaffold → jira-mine", () => {
    const v = classifyMessage("integrate with Jira for ticket tracking", ctx);
    expect(v.kind).toBe("scaffold");
    if (v.kind !== "scaffold") return;
    expect(v.plan.plugin.id).toMatch(/jira/);
  });

  it("falls through to conversation when scaffold trigger matches but no noun found", () => {
    const v = classifyMessage("connect to the idea", ctx);
    expect(v.kind).toBe("conversation");
  });

  it("scaffold-first: ambiguous message prefers scaffold when plugin noun found", () => {
    const v = classifyMessage(
      "build me a tool that pulls my github issues",
      ctx
    );
    expect(v.kind).toBe("scaffold");
  });
});

describe("classifyMessage — conversation path", () => {
  it("classifies 'what did we discuss yesterday' as conversation", () => {
    const v = classifyMessage("what did we discuss yesterday?", ctx);
    expect(v.kind).toBe("conversation");
  });

  it("classifies empty string as conversation", () => {
    expect(classifyMessage("", ctx).kind).toBe("conversation");
    expect(classifyMessage("   ", ctx).kind).toBe("conversation");
  });

  it("classifies a greeting as conversation", () => {
    expect(classifyMessage("hi, how are you?", ctx).kind).toBe("conversation");
  });
});

describe("classifyMessage — totality", () => {
  it("never throws on arbitrary input", () => {
    const inputs = [
      "\0\0\0",
      "a".repeat(10000),
      "🤖🤖🤖",
      "'); DROP TABLE users; --",
      "```build me``` `portfolio`",
    ];
    for (const s of inputs) {
      expect(() => classifyMessage(s, ctx)).not.toThrow();
    }
  });
});
