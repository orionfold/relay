/** @vitest-environment node */

import { describe, expect, it } from "vitest";
import {
  readXlsxWorkbook,
  writeXlsxWorkbook,
} from "@/lib/spreadsheets/xlsx";

describe("maintained spreadsheet dependency contract", () => {
  it("round-trips typed cells and worksheet identity", async () => {
    const bytes = await writeXlsxWorkbook(
      [
        ["Customer", "Monthly value", "Active", "Renewal"],
        ["Acme", 1250, true, new Date(2026, 6, 23)],
      ],
      "Customer value",
    );
    const [sheet] = await readXlsxWorkbook(bytes);

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(sheet?.name).toBe("Customer value");
    expect(sheet?.rows[1]?.[0]).toBe("Acme");
    expect(sheet?.rows[1]?.[1]).toBe(1250);
    expect(sheet?.rows[1]?.[2]).toBe(true);
    expect(sheet?.rows[1]?.[3]).toEqual(new Date(2026, 6, 23));
  });

  it("normalizes unsupported table values before writing", async () => {
    const bytes = await writeXlsxWorkbook(
      [["Customer", "Tags"], ["Acme", ["priority", "renewal"]]],
      "Customers",
    );
    const [sheet] = await readXlsxWorkbook(bytes);

    expect(sheet?.rows[1]).toEqual(["Acme", "priority,renewal"]);
  });
});
