// Shapes the cell values Google hands back the way both adapters promise: as wide as the header, cut, and clean (S33).

/** What a formula that fails shows in a cell; the whole cell, never a part of a longer text. */
const sheetsErrorValues: ReadonlySet<string> = new Set([
  "#N/A",
  "#REF!",
  "#VALUE!",
  "#DIV/0!",
  "#NAME?",
  "#NUM!",
  "#NULL!",
  "#ERROR!",
]);

function cellText(value: unknown, maxCellLength: number): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  const shown = text.length > maxCellLength ? text.slice(0, maxCellLength) : text;
  return sheetsErrorValues.has(shown.trim()) ? "" : shown;
}

/**
 * Every row padded to the width of the first (the header, cut to maxColumns), each cell cut to maxCellLength, and a
 * Sheets error value ("#REF!") read as an empty cell. A phone's leading zero is kept as shown.
 */
export function shapeRows(
  values: readonly (readonly unknown[])[],
  limits: { maxColumns: number; maxCellLength: number },
): string[][] {
  const width = Math.min(values[0]?.length ?? 0, limits.maxColumns);
  return values.map((row) => Array.from({ length: width }, (_, index) => cellText(row[index], limits.maxCellLength)));
}
