import ExcelJS from "exceljs";

export type Cell = string | null;
export type Rows = Cell[][];

/**
 * Reads the first worksheet of an xlsx buffer into a 2D array of strings.
 * Replaces `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false })`.
 *
 * - Empty cells become `null`.
 * - Numbers, dates, and formulas are coerced to their displayed-text form
 *   (matching SheetJS's `raw: false` behavior closely enough for our parsers).
 * - Multi-line strings keep their newlines.
 * - The returned grid is rectangular up to the worksheet's reported dimensions.
 */
export async function readSheetRows(buffer: ArrayBuffer | Buffer | Uint8Array): Promise<Rows> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS accepts ArrayBuffer/Buffer/Uint8Array at runtime, but its older
  // type signature lists only `Buffer`. Cast away the mismatch.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rowCount = sheet.rowCount;
  const colCount = sheet.columnCount;
  const rows: Rows = [];

  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const arr: Cell[] = new Array(colCount).fill(null);
    for (let c = 1; c <= colCount; c++) {
      arr[c - 1] = cellToString(row.getCell(c));
    }
    rows.push(arr);
  }

  return rows;
}

function cellToString(cell: ExcelJS.Cell): Cell {
  const v = cell.value;
  if (v === null || v === undefined) return null;

  if (typeof v === "string") {
    return v.trim() === "" ? null : v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    // Use cell.text so cells with number formats render as displayed
    // (e.g., "1,000" rather than "1000"). Falls back to String(v).
    const text = cell.text;
    return text === "" ? null : text;
  }
  if (v instanceof Date) {
    // YYYY-MM-DD matches what the parsers expect for date columns
    const iso = v.toISOString();
    return iso.split("T")[0];
  }

  // Rich text: { richText: [{ text }, ...] }
  if (typeof v === "object" && "richText" in v && Array.isArray((v as { richText: unknown[] }).richText)) {
    const parts = (v as { richText: { text: string }[] }).richText;
    const text = parts.map((p) => p.text).join("");
    return text.trim() === "" ? null : text;
  }

  // Formula: { formula, result }
  if (typeof v === "object" && "result" in v) {
    const result = (v as { result: unknown }).result;
    if (result === null || result === undefined) return null;
    if (typeof result === "string") return result.trim() === "" ? null : result;
    if (result instanceof Date) return result.toISOString().split("T")[0];
    return String(result);
  }

  // Hyperlink: { text, hyperlink }
  if (typeof v === "object" && "text" in v) {
    return String((v as { text: unknown }).text);
  }

  return String(v);
}
