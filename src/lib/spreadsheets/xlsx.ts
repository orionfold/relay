import readXlsxFile from "read-excel-file/node";
import writeXlsxFile, {
  type Cell,
  type SheetData,
} from "write-excel-file/node";

export type XlsxCellValue = string | number | boolean | Date | null;

export interface XlsxSheet {
  name: string;
  rows: XlsxCellValue[][];
}

export async function readXlsxWorkbook(
  input: Buffer,
): Promise<XlsxSheet[]> {
  const sheets = await readXlsxFile(input);
  return sheets.map(({ sheet, data }) => ({
    name: sheet,
    rows: data.map((row) => row.map(normalizeReadCell)),
  }));
}

export async function writeXlsxWorkbook(
  rows: unknown[][],
  sheetName: string,
): Promise<Buffer> {
  const data: SheetData = rows.map((row) => row.map(normalizeCell));
  return writeXlsxFile(data, {
    sheet: sheetName,
    dateFormat: "yyyy-mm-dd",
  }).toBuffer();
}

function normalizeReadCell(value: unknown): XlsxCellValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  return String(value);
}

function normalizeCell(value: unknown): Cell {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  return String(value);
}
