// A cell as the readers hand it on (D10): text, trimmed, one leading apostrophe dropped, cut one character past the
// limit; a whole number with every digit; a date as its day; null when empty.

/** What a reader found in a cell before it becomes text. */
export type RawCell = string | number | boolean | Date | null | undefined;

/** "yyyy-mm-dd" of a date in UTC: Excel's dates carry no zone, and the reader stores them as UTC days. */
const dayOf = (date: Date) => date.toISOString().slice(0, 10);

/** A number as a person typed it: 919876543210 never as 9.19876543210E+11, nor with a ".0". */
function numberText(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value) && Math.abs(value) < 1e21 ? value.toFixed(0) : String(value);
}

export function cellText(value: RawCell, maxCellLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return numberText(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : dayOf(value);
  // Cut first, so trimming a 10 MB cell never copies it whole.
  const trimmed = value.slice(0, maxCellLength + 2).trim();
  // One apostrophe goes: Excel's way of keeping text as text, and B40's prefix on what this product exports.
  const text = trimmed.startsWith("'") ? trimmed.slice(1) : trimmed;
  return text === "" ? null : text.slice(0, maxCellLength + 1);
}
