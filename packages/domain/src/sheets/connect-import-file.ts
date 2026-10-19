// The rows already in a sheet, as the CSV of an ordinary lead import (S14, 3.3): the newest rows up to the bulk limit,
// under the sheet's own header names, as text.
import type { SheetRead } from "@travel-crm/integrations/google-sheets";
import type { Spreadsheets } from "@travel-crm/integrations/spreadsheets";
import { nameColumns } from "./header-keys.js";
import { connectImportMaxRows } from "./limits.js";

export async function connectImportCsv(
  spreadsheets: Spreadsheets,
  read: Pick<SheetRead, "header" | "rows">,
): Promise<{ bytes: Uint8Array; rows: number }> {
  const named = nameColumns(read.header);
  const written = read.rows.filter((row) => row.cells.some((cell) => cell.trim() !== "")).slice(-connectImportMaxRows);
  const writer = spreadsheets.writer({
    kind: "csv",
    sheetName: "Rows",
    columns: named.map(({ header }) => ({ header, kind: "text" as const })),
  });
  writer.write(written.map((row) => named.map((_, index) => row.cells[index] ?? null)));
  return { bytes: await writer.finish(), rows: written.length };
}
