import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  projects,
  userTables,
  userTableColumns,
  userTableRows,
  workflows,
} from "@/lib/db/schema";
import { addRows } from "@/lib/data/tables";
import { invalidateAppsCache } from "@/lib/apps/registry";
import * as registry from "@/lib/apps/registry";

/**
 * Integration test for W7.1 of row-trigger-blueprint-execution.
 *
 * Asserts that addRows → evaluateManifestTriggers → instantiateBlueprint
 * persists `_contextRowId` into the workflow's `definition` column. This
 * exercises the full dispatcher path against the real DB (via the test
 * setup at src/test/setup.ts which provisions an isolated RELAY_DATA_DIR).
 *
 * We mock:
 *   1. `listAppsWithManifestsCached` — provide a fixture manifest subscribing
 *      to our test table without needing real `~/.ainative/apps/` files
 *   2. `executeWorkflow` — no-op; engine execution is out of scope here.
 *      W2.1 covers engine reading `_contextRowId` separately.
 */

vi.mock("@/lib/apps/registry", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/apps/registry")>(
      "@/lib/apps/registry"
    );
  return {
    ...actual,
    listAppsWithManifestsCached: vi.fn(() => []),
  };
});

vi.mock("@/lib/workflows/engine", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/workflows/engine")>(
      "@/lib/workflows/engine"
    );
  return {
    ...actual,
    executeWorkflow: vi.fn().mockResolvedValue(undefined),
  };
});

describe("addRows end-to-end manifest-trigger dispatch", () => {
  beforeEach(async () => {
    invalidateAppsCache();
    vi.clearAllMocks();

    // Clean any prior state from earlier tests (FK-safe order)
    await db.delete(userTableRows).where(eq(userTableRows.tableId, "tbl-int"));
    await db
      .delete(userTableColumns)
      .where(eq(userTableColumns.tableId, "tbl-int"));
    await db.delete(userTables).where(eq(userTables.id, "tbl-int"));
    await db.delete(workflows).where(eq(workflows.projectId, "test-app-int"));
    await db.delete(projects).where(eq(projects.id, "test-app-int"));

    const now = new Date();

    await db.insert(projects).values({
      id: "test-app-int",
      name: "Test app integration",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(userTables).values({
      id: "tbl-int",
      name: "tbl-int",
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(userTableColumns).values({
      id: "col-int-topic",
      tableId: "tbl-int",
      name: "topic",
      displayName: "Topic",
      dataType: "text",
      position: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("creates a workflow with _contextRowId when a manifest subscribes", async () => {
    vi.mocked(registry.listAppsWithManifestsCached).mockReturnValue([
      {
        id: "test-app-int",
        manifest: {
          id: "test-app-int",
          name: "Test integration",
          // research-report is a builtin so getBlueprint resolves it
          // without depending on ~/.ainative/blueprints/ filesystem state.
          blueprints: [
            {
              id: "research-report",
              trigger: { kind: "row-insert", table: "tbl-int" },
            },
          ],
          tables: [{ id: "tbl-int" }],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ]);

    const { ids } = await addRows("tbl-int", [
      { data: { topic: "test row data", depth: "standard" } },
    ]);
    const rowId = ids[0]!;

    // Dispatcher is fire-and-forget — poll briefly for the workflow row.
    const start = Date.now();
    let workflow: typeof workflows.$inferSelect | undefined;
    while (Date.now() - start < 2000) {
      const all = await db
        .select()
        .from(workflows)
        .where(eq(workflows.projectId, "test-app-int"));
      if (all.length > 0) {
        workflow = all[0];
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(workflow).toBeDefined();
    const def = JSON.parse(workflow!.definition);
    expect(def._contextRowId).toBe(rowId);
    expect(def._blueprintId).toBe("research-report");
  });

  it("does not create a workflow when no manifest subscribes", async () => {
    vi.mocked(registry.listAppsWithManifestsCached).mockReturnValue([]);

    const before = await db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, "test-app-int"));
    const beforeCount = before.length;

    await addRows("tbl-int", [
      { data: { topic: "no-subscriber test", depth: "standard" } },
    ]);

    // Wait briefly to confirm no async dispatch fires.
    await new Promise((r) => setTimeout(r, 200));

    const after = await db
      .select()
      .from(workflows)
      .where(eq(workflows.projectId, "test-app-int"));
    expect(after.length).toBe(beforeCount);
  });
});
