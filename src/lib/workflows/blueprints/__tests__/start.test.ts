import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workflowReceiptRuns, workflows } from "@/lib/db/schema";

const { resolveTargets } = vi.hoisted(() => ({
  resolveTargets: vi.fn(),
}));
vi.mock("@/lib/workflows/execution-targets", () => ({
  resolveWorkflowExecutionTargets: resolveTargets,
}));

import {
  BlueprintStartConflictError,
  startBlueprint,
} from "../start";

const variables = { topic: "first value", depth: "standard" };

describe("startBlueprint atomic boundary", () => {
  const ids: string[] = [];

  beforeEach(() => {
    resolveTargets.mockReset();
    resolveTargets.mockResolvedValue([]);
  });

  afterEach(() => {
    for (const id of ids.splice(0)) {
      db.delete(workflowReceiptRuns)
        .where(eq(workflowReceiptRuns.workflowId, id))
        .run();
      db.delete(workflows).where(eq(workflows.id, id)).run();
    }
  });

  it("preflights before insertion so refusal creates zero workflow rows", async () => {
    const id = crypto.randomUUID();
    ids.push(id);
    resolveTargets.mockRejectedValue(new Error("No eligible runtime"));

    await expect(
      startBlueprint({
        blueprintId: "research-report",
        variables,
        idempotencyKey: id,
      }),
    ).rejects.toThrow("No eligible runtime");

    expect(
      db.select().from(workflows).where(eq(workflows.id, id)).get(),
    ).toBeUndefined();
    expect(
      db
        .select()
        .from(workflowReceiptRuns)
        .where(eq(workflowReceiptRuns.workflowId, id))
        .all(),
    ).toHaveLength(0);
  });

  it("atomically creates an active workflow and exactly one first-run receipt", async () => {
    const id = crypto.randomUUID();
    ids.push(id);

    const result = await startBlueprint({
      blueprintId: "research-report",
      variables,
      idempotencyKey: id,
    });

    expect(result).toMatchObject({ workflowId: id, duplicate: false });
    expect(
      db.select().from(workflows).where(eq(workflows.id, id)).get(),
    ).toMatchObject({ id, status: "active", runNumber: 1 });
    expect(
      db
        .select()
        .from(workflowReceiptRuns)
        .where(eq(workflowReceiptRuns.workflowId, id))
        .all(),
    ).toEqual([
      expect.objectContaining({ workflowId: id, runNumber: 1 }),
    ]);
  });

  it("converges a repeated request identity on the exact existing run", async () => {
    const id = crypto.randomUUID();
    ids.push(id);
    const input = {
      blueprintId: "research-report",
      variables,
      idempotencyKey: id,
    };

    const first = await startBlueprint(input);
    resolveTargets.mockRejectedValue(new Error("Provider became unavailable"));
    const repeated = await startBlueprint(input);

    expect(first.duplicate).toBe(false);
    expect(repeated).toMatchObject({ workflowId: id, duplicate: true });
    expect(resolveTargets).toHaveBeenCalledTimes(1);
    expect(
      db
        .select()
        .from(workflowReceiptRuns)
        .where(eq(workflowReceiptRuns.workflowId, id))
        .all(),
    ).toHaveLength(1);
  });

  it("rejects reuse of a request identity for different resolved work", async () => {
    const id = crypto.randomUUID();
    ids.push(id);
    await startBlueprint({
      blueprintId: "research-report",
      variables,
      idempotencyKey: id,
    });

    await expect(
      startBlueprint({
        blueprintId: "research-report",
        variables: { topic: "different", depth: "standard" },
        idempotencyKey: id,
      }),
    ).rejects.toBeInstanceOf(BlueprintStartConflictError);
  });
});
