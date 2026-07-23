import { describe, expect, it } from "vitest";
import { discloseAgencySampleKpis } from "../sample-data-presentation";

describe("Agency sample KPI disclosure", () => {
  it("labels only KPIs backed by tables that still contain samples", () => {
    const result = discloseAgencySampleKpis(
      [
        { id: "billed-mtd", label: "Billed", value: "$0" },
        { id: "active-clients", label: "Clients", value: "1" },
        { id: "unrelated", label: "Runs", value: "0" },
      ],
      {
        appId: "relay-agency",
        untouchedRows: 0,
        editedRows: 1,
        untouchedCustomers: 0,
        editedCustomers: 0,
        tableCounts: [
          {
            tableId: "clients",
            tableName: "Clients",
            untouched: 0,
            edited: 1,
          },
          {
            tableId: "engagements",
            tableName: "Engagements",
            untouched: 0,
            edited: 0,
          },
        ],
      }
    );

    expect(result[0].hint).toBeUndefined();
    expect(result[1].hint).toBe("Includes synthetic sample data");
    expect(result[2].hint).toBeUndefined();
  });
});
