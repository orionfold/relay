import { and, count, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  customers,
  projects,
  usageLedger,
  userTableColumns,
  userTableRows,
  userTables,
} from "@/lib/db/schema";
import { hashRowData } from "@/lib/data/row-hash";
import { hashCustomerSeed } from "@/lib/customers";

export type SampleDataState = "sample" | "sample-edited";

export interface SampleDataSummary {
  appId: string;
  untouchedRows: number;
  editedRows: number;
  untouchedCustomers: number;
  editedCustomers: number;
  tableCounts: Array<{
    tableId: string;
    tableName: string;
    untouched: number;
    edited: number;
  }>;
}

export interface RemoveSampleDataResult extends SampleDataSummary {
  removedRows: number;
  removedCustomers: number;
  protectedCustomers: number;
}

export async function getSampleDataSummary(
  appId: string
): Promise<SampleDataSummary> {
  const tables = await db
    .select({ id: userTables.id, name: userTables.name })
    .from(userTables)
    .where(eq(userTables.projectId, appId));
  await reconcileStaleSampleStates(appId, tables.map((table) => table.id));

  const tableCounts = await Promise.all(
    tables.map(async (table) => {
      const rows = await db
        .select({ state: userTableRows.sampleState, total: count() })
        .from(userTableRows)
        .where(
          and(
            eq(userTableRows.tableId, table.id),
            eq(userTableRows.sampleSource, appId)
          )
        )
        .groupBy(userTableRows.sampleState);
      return {
        tableId: table.id,
        tableName: table.name,
        untouched:
          rows.find((row) => row.state === "sample")?.total ?? 0,
        edited:
          rows.find((row) => row.state === "sample-edited")?.total ?? 0,
      };
    })
  );

  const customerCounts = await db
    .select({ state: customers.sampleState, total: count() })
    .from(customers)
    .where(eq(customers.sampleSource, appId))
    .groupBy(customers.sampleState);

  return {
    appId,
    untouchedRows: tableCounts.reduce((sum, table) => sum + table.untouched, 0),
    editedRows: tableCounts.reduce((sum, table) => sum + table.edited, 0),
    untouchedCustomers:
      customerCounts.find((row) => row.state === "sample")?.total ?? 0,
    editedCustomers:
      customerCounts.find((row) => row.state === "sample-edited")?.total ?? 0,
    tableCounts,
  };
}

/**
 * Conservative repair for writers that bypass the normal mutation helpers.
 * A hash mismatch can only promote `sample` to `sample-edited`; it never
 * restores edited state or infers that an unmarked legacy record is sample.
 */
async function reconcileStaleSampleStates(
  appId: string,
  tableIds: string[]
): Promise<void> {
  for (const tableId of tableIds) {
    const columns = await db
      .select({ name: userTableColumns.name })
      .from(userTableColumns)
      .where(eq(userTableColumns.tableId, tableId))
      .orderBy(userTableColumns.position);
    if (columns.length === 0) continue;
    const names = columns.map((column) => column.name);
    const candidates = await db
      .select({
        id: userTableRows.id,
        data: userTableRows.data,
        seedHash: userTableRows.sampleSeedHash,
      })
      .from(userTableRows)
      .where(
        and(
          eq(userTableRows.tableId, tableId),
          eq(userTableRows.sampleSource, appId),
          eq(userTableRows.sampleState, "sample")
        )
      );
    const editedIds = candidates
      .filter((row) => {
        if (!row.seedHash) return true;
        try {
          return (
            hashRowData(
              JSON.parse(row.data) as Record<string, unknown>,
              names
            ) !== row.seedHash
          );
        } catch {
          return true;
        }
      })
      .map((row) => row.id);
    if (editedIds.length > 0) {
      await db
        .update(userTableRows)
        .set({ sampleState: "sample-edited" })
        .where(inArray(userTableRows.id, editedIds));
    }
  }

  const customerCandidates = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.sampleSource, appId),
        eq(customers.sampleState, "sample")
      )
    );
  const editedCustomerIds = customerCandidates
    .filter((customer) => {
      if (!customer.sampleSeedHash) return true;
      return (
        hashCustomerSeed({
          name: customer.name,
          slug: customer.slug,
          status: customer.status,
          industry: customer.industry,
          notes: customer.notes,
        }) !== customer.sampleSeedHash
      );
    })
    .map((customer) => customer.id);
  if (editedCustomerIds.length > 0) {
    await db
      .update(customers)
      .set({ sampleState: "sample-edited" })
      .where(inArray(customers.id, editedCustomerIds));
  }
}

/**
 * Remove only rows whose provenance still says `sample`. Any edited sample,
 * customer-created row, or referenced customer is preserved. Repeating this
 * operation is safe and returns zero removals after the first success.
 */
export async function removeUntouchedSampleData(
  appId: string
): Promise<RemoveSampleDataResult> {
  const before = await getSampleDataSummary(appId);
  const tableIds = before.tableCounts.map((table) => table.tableId);

  let removedRows = 0;
  if (tableIds.length > 0) {
    const candidates = await db
      .select({
        id: userTableRows.id,
        tableId: userTableRows.tableId,
        data: userTableRows.data,
        seedHash: userTableRows.sampleSeedHash,
      })
      .from(userTableRows)
      .where(
        and(
          inArray(userTableRows.tableId, tableIds),
          eq(userTableRows.sampleSource, appId),
          eq(userTableRows.sampleState, "sample")
        )
      );
    const columnNamesByTable = new Map<string, string[]>();
    for (const tableId of tableIds) {
      const columns = await db
        .select({ name: userTableColumns.name })
        .from(userTableColumns)
        .where(eq(userTableColumns.tableId, tableId))
        .orderBy(userTableColumns.position);
      columnNamesByTable.set(tableId, columns.map((column) => column.name));
    }
    const untouchedIds: string[] = [];
    const staleEditedIds: string[] = [];
    for (const candidate of candidates) {
      const columns = columnNamesByTable.get(candidate.tableId) ?? [];
      const currentHash =
        candidate.seedHash && columns.length > 0
          ? hashRowData(
              JSON.parse(candidate.data) as Record<string, unknown>,
              columns
            )
          : null;
      if (currentHash && currentHash === candidate.seedHash) {
        untouchedIds.push(candidate.id);
      } else {
        staleEditedIds.push(candidate.id);
      }
    }
    if (staleEditedIds.length > 0) {
      await db
        .update(userTableRows)
        .set({ sampleState: "sample-edited" })
        .where(inArray(userTableRows.id, staleEditedIds));
    }
    if (untouchedIds.length > 0) {
      const deleted = await db
        .delete(userTableRows)
        .where(inArray(userTableRows.id, untouchedIds))
        .returning({ id: userTableRows.id });
      removedRows = deleted.length;
    }

    await db
      .update(userTables)
      .set({
        rowCount: sql<number>`(
          SELECT COUNT(*) FROM user_table_rows
          WHERE user_table_rows.table_id = user_tables.id
        )`,
        updatedAt: new Date(),
      })
      .where(inArray(userTables.id, tableIds));
  }

  const protectedIds = new Set(
    (
      await db
        .select({ id: projects.customerId })
        .from(projects)
        .where(sql`${projects.customerId} IS NOT NULL`)
    )
      .map((row) => row.id)
      .filter((id): id is string => Boolean(id))
  );
  for (const row of await db
    .select({ id: usageLedger.customerId })
    .from(usageLedger)
    .where(sql`${usageLedger.customerId} IS NOT NULL`)) {
    if (row.id) protectedIds.add(row.id);
  }

  const customerCandidates = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.sampleSource, appId),
        eq(customers.sampleState, "sample"),
        protectedIds.size > 0
          ? notInArray(customers.id, [...protectedIds])
          : undefined
      )
    );
  const removableCustomerIds: string[] = [];
  const staleEditedCustomerIds: string[] = [];
  for (const customer of customerCandidates) {
    const currentHash = customer.sampleSeedHash
      ? hashCustomerSeed({
          name: customer.name,
          slug: customer.slug,
          status: customer.status,
          industry: customer.industry,
          notes: customer.notes,
        })
      : null;
    if (currentHash && currentHash === customer.sampleSeedHash) {
      removableCustomerIds.push(customer.id);
    } else {
      staleEditedCustomerIds.push(customer.id);
    }
  }
  if (staleEditedCustomerIds.length > 0) {
    await db
      .update(customers)
      .set({ sampleState: "sample-edited" })
      .where(inArray(customers.id, staleEditedCustomerIds));
  }
  let removedCustomers = 0;
  if (removableCustomerIds.length > 0) {
    const deleted = await db
      .delete(customers)
      .where(inArray(customers.id, removableCustomerIds))
      .returning({ id: customers.id });
    removedCustomers = deleted.length;
  }

  const after = await getSampleDataSummary(appId);
  return {
    ...after,
    removedRows,
    removedCustomers,
    protectedCustomers: Math.max(
      0,
      before.untouchedCustomers - removedCustomers
    ),
  };
}
