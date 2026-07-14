import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

interface WorkflowRow {
  id: string;
  name: string;
  definition: string | null;
  projectId: string | null;
}

const { mockWorkflowRows } = vi.hoisted(() => ({
  mockWorkflowRows: { value: [] as WorkflowRow[] },
}));

// Minimal drizzle query builder stub — supports
//   db.select({...}).from(table).where(...)
// by returning a thenable that resolves to mockWorkflowRows.value.
vi.mock("@/lib/db", () => {
  const builder = {
    from() {
      return this;
    },
    where() {
      return this;
    },
    then<TResolve>(resolve: (rows: WorkflowRow[]) => TResolve) {
      return Promise.resolve(mockWorkflowRows.value).then(resolve);
    },
  };
  return {
    db: {
      select: () => builder,
    },
  };
});

// Stub the schema import so drizzle-orm doesn't try to read a real table.
vi.mock("@/lib/db/schema", () => ({
  workflows: { projectId: "projectId" },
  tasks: {},
  agentLogs: {},
  notifications: {},
  documents: {},
  workflowDocumentInputs: {},
}));

// Stub drizzle-orm operators used in workflow-tools.ts — the tests only
// care about the return value of the builder, not the operator objects.
vi.mock("drizzle-orm", () => ({
  eq: () => ({}),
  and: () => ({}),
  desc: () => ({}),
  inArray: () => ({}),
  like: () => ({}),
}));

import { findSimilarWorkflows, workflowTools } from "../workflow-tools";

function parseWorkflowToolArgs(toolName: string, args: unknown) {
  const tool = workflowTools({ projectId: "project-1" } as never).find(
    (candidate) => candidate.name === toolName
  );
  if (!tool) throw new Error(`Tool not found: ${toolName}`);
  return z.object(tool.zodShape).safeParse(args);
}

describe("workflow Operations Receipt criteria", () => {
  const base = {
    name: "Receipt workflow",
    definition: JSON.stringify({
      pattern: "sequence",
      steps: [{ id: "one", name: "One", prompt: "Do one" }],
    }),
  };

  it("accepts typed criteria and rejects arbitrary judges", () => {
    const criterion = {
      id: "completed",
      label: "Completed",
      level: "required",
      check: "status_is",
      value: "completed",
    };
    expect(
      parseWorkflowToolArgs("create_workflow", {
        ...base,
        successCriteria: [criterion],
      }).success
    ).toBe(true);
    expect(
      parseWorkflowToolArgs("create_workflow", {
        ...base,
        successCriteria: [{ ...criterion, check: "llm_judge" }],
      }).success
    ).toBe(false);
  });
});

function setRows(rows: WorkflowRow[]) {
  mockWorkflowRows.value = rows;
}

describe("findSimilarWorkflows", () => {
  beforeEach(() => {
    setRows([]);
  });

  it("returns [] when projectId is null (no cross-project dedup)", async () => {
    setRows([
      {
        id: "wf1",
        name: "Research Customer Feedback",
        definition: JSON.stringify({
          pattern: "sequence",
          steps: [{ id: "s1", name: "Research customer feedback", prompt: "do research" }],
        }),
        projectId: null,
      },
    ]);

    const result = await findSimilarWorkflows(
      null,
      "Research Customer Feedback",
      JSON.stringify({ pattern: "sequence", steps: [] })
    );
    expect(result).toEqual([]);
  });

  it("returns [] when no workflows exist in the project", async () => {
    setRows([]);
    const result = await findSimilarWorkflows(
      "proj_a",
      "Any name",
      JSON.stringify({ pattern: "sequence", steps: [] })
    );
    expect(result).toEqual([]);
  });

  it("matches exact name (case-insensitive) with similarity 1.0", async () => {
    setRows([
      {
        id: "wf1",
        name: "Research Customer Feedback",
        definition: null,
        projectId: "proj_a",
      },
    ]);

    const result = await findSimilarWorkflows(
      "proj_a",
      "research customer feedback",
      JSON.stringify({ pattern: "sequence", steps: [] })
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "wf1",
      similarity: 1,
    });
    expect(result[0].reason).toContain("Same name");
  });

  it("matches on Jaccard similarity over step names + prompts (redesign scenario)", async () => {
    // Simulates the bug scenario: LLM "redesigns" a workflow mid-conversation,
    // using mostly the same vocabulary as the original. The definitions are
    // near-identical (as redesigns typically are in practice) so Jaccard
    // should exceed the 0.7 threshold.
    const sharedSteps = [
      { id: "s1", name: "Research customer cohort", prompt: "Investigate customer research cohort feedback insights" },
      { id: "s2", name: "Interview protocol draft", prompt: "Draft customer interview questions protocol script" },
      { id: "s3", name: "Synthesize findings", prompt: "Summarize customer research findings insights report" },
    ];
    setRows([
      {
        id: "wf1",
        name: "Customer Discovery Pipeline",
        definition: JSON.stringify({ pattern: "sequence", steps: sharedSteps }),
        projectId: "proj_a",
      },
    ]);

    const result = await findSimilarWorkflows(
      "proj_a",
      "Customer Discovery Workflow v2",
      JSON.stringify({ pattern: "sequence", steps: sharedSteps })
    );

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].id).toBe("wf1");
    expect(result[0].similarity).toBeGreaterThanOrEqual(0.7);
  });

  it("does NOT match when names and step text are completely different", async () => {
    setRows([
      {
        id: "wf1",
        name: "Deploy frontend release",
        definition: JSON.stringify({
          pattern: "sequence",
          steps: [{ id: "s1", name: "Deploy staging", prompt: "Push release artifact to staging environment" }],
        }),
        projectId: "proj_a",
      },
    ]);

    const result = await findSimilarWorkflows(
      "proj_a",
      "Customer interview analysis",
      JSON.stringify({
        pattern: "sequence",
        steps: [{ id: "s2", name: "Summarize interviews", prompt: "Pull insights from recent customer interviews" }],
      })
    );

    expect(result).toEqual([]);
  });

  it("caps results at 3 and sorts by similarity descending", async () => {
    // Four rows, all exact-name matches (similarity 1.0). Expect exactly 3 returned.
    setRows(
      Array.from({ length: 4 }).map((_, i) => ({
        id: `wf${i}`,
        name: "Duplicate Workflow",
        definition: null,
        projectId: "proj_a",
      }))
    );

    const result = await findSimilarWorkflows(
      "proj_a",
      "Duplicate Workflow",
      JSON.stringify({ pattern: "sequence", steps: [] })
    );

    expect(result).toHaveLength(3);
    expect(result.every((r) => r.similarity === 1)).toBe(true);
  });

  it("handles malformed definition JSON without crashing", async () => {
    setRows([
      {
        id: "wf1",
        name: "Legit Workflow",
        definition: "not-json-at-all",
        projectId: "proj_a",
      },
    ]);

    // Should not throw — just degrades to name-only comparison.
    const result = await findSimilarWorkflows(
      "proj_a",
      "Legit Workflow",
      "also not json"
    );
    expect(result).toHaveLength(1);
    expect(result[0].similarity).toBe(1); // exact name match
  });

  // ── Legitimate variant tolerance ────────────────────────────────────
  //
  // Regression tests for the concern flagged in the code review of
  // commit b5ed09b: that WORKFLOW_DEDUP_THRESHOLD = 0.7 on a pooled
  // Jaccard over keywords would flag legitimate target-entity variants
  // (e.g. "Enrich contacts" vs "Enrich accounts") as duplicates,
  // eroding trust in the guardrail. Each pair here shares a dominant
  // verb and most of the step structure — the only difference is the
  // target entity noun.
  //
  // Success criterion per spec:
  //   - the two "positive-variant" cases must return [] (no match)
  //   - the two "guard" cases must still flag duplicates (similarity >=
  //     WORKFLOW_DEDUP_THRESHOLD, or exact-name match)
  describe("legitimate variant tolerance", () => {
    it("allows Enrich contacts and Enrich accounts as distinct workflows", async () => {
      setRows([
        {
          id: "wf1",
          name: "Enrich contacts",
          definition: JSON.stringify({
            pattern: "sequence",
            steps: [
              { id: "s1", name: "Load rows from contacts table", prompt: "Select rows from the contacts table" },
              { id: "s2", name: "Call enrichment agent", prompt: "Invoke enrichment agent on each row" },
              { id: "s3", name: "Write back to table", prompt: "Write enriched data back to the contacts table" },
            ],
          }),
          projectId: "proj_a",
        },
      ]);

      const result = await findSimilarWorkflows(
        "proj_a",
        "Enrich accounts",
        JSON.stringify({
          pattern: "sequence",
          steps: [
            { id: "s1", name: "Load rows from accounts table", prompt: "Select rows from the accounts table" },
            { id: "s2", name: "Call enrichment agent", prompt: "Invoke enrichment agent on each row" },
            { id: "s3", name: "Write back to table", prompt: "Write enriched data back to the accounts table" },
          ],
        })
      );

      expect(result).toEqual([]);
    });

    it("allows Daily standup digest and Weekly standup digest as distinct workflows", async () => {
      setRows([
        {
          id: "wf1",
          name: "Daily standup digest",
          definition: JSON.stringify({
            pattern: "sequence",
            steps: [
              { id: "s1", name: "Fetch standup messages", prompt: "Pull daily standup messages from the team channel" },
              { id: "s2", name: "Summarize daily topics", prompt: "Write a daily digest of key topics and blockers" },
              { id: "s3", name: "Post digest to channel", prompt: "Post the daily summary digest to the #ops channel" },
            ],
          }),
          projectId: "proj_a",
        },
      ]);

      const result = await findSimilarWorkflows(
        "proj_a",
        "Weekly standup digest",
        JSON.stringify({
          pattern: "sequence",
          steps: [
            { id: "s1", name: "Fetch standup messages", prompt: "Pull weekly standup messages from the team channel" },
            { id: "s2", name: "Summarize weekly topics", prompt: "Write a weekly digest of key topics and blockers" },
            { id: "s3", name: "Post digest to channel", prompt: "Post the weekly summary digest to the #ops channel" },
          ],
        })
      );

      expect(result).toEqual([]);
    });

    it("still blocks exact case-insensitive name matches (guard)", async () => {
      setRows([
        {
          id: "wf1",
          name: "Enrich contacts",
          definition: JSON.stringify({
            pattern: "sequence",
            steps: [
              { id: "s1", name: "Load rows from contacts table", prompt: "Select rows from the contacts table" },
            ],
          }),
          projectId: "proj_a",
        },
      ]);

      const result = await findSimilarWorkflows(
        "proj_a",
        "ENRICH CONTACTS", // same name, different case
        JSON.stringify({ pattern: "sequence", steps: [] })
      );

      expect(result).toHaveLength(1);
      expect(result[0].similarity).toBe(1);
      expect(result[0].reason).toContain("Same name");
    });

    it("still blocks near-identical step content with near-identical name (guard)", async () => {
      const sharedSteps = [
        { id: "s1", name: "Fetch customer segments list", prompt: "Load the customer segments list from BigQuery warehouse" },
        { id: "s2", name: "Classify each segment bucket", prompt: "Classify each customer segment bucket using ML model" },
        { id: "s3", name: "Write segments back warehouse", prompt: "Write segment classifications back into BigQuery warehouse" },
      ];
      setRows([
        {
          id: "wf1",
          name: "Classify customer segments v1",
          definition: JSON.stringify({ pattern: "sequence", steps: sharedSteps }),
          projectId: "proj_a",
        },
      ]);

      const result = await findSimilarWorkflows(
        "proj_a",
        "Classify customer segments v2",
        JSON.stringify({ pattern: "sequence", steps: sharedSteps })
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].id).toBe("wf1");
      expect(result[0].similarity).toBeGreaterThanOrEqual(0.7);
    });
  });
});
