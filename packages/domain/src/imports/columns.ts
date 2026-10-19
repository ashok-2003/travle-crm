// What the reader keeps of each column (B11, D13): its name, cut to 200 characters; its first three non-empty values;
// and, when it has at most fifty different values, those values with how many rows hold each, the commonest first.
import { MAX_LISTED_VALUES } from "@travel-crm/contracts/imports";
import type { ReadSheet } from "@travel-crm/integrations/spreadsheets";

/** The longest header and sample kept: what a column's row on screen can show. */
const MAX_KEPT_TEXT = 200;

export interface ColumnSummary {
  position: number;
  header: string;
  samples: string[];
  /** Empty when the column has more than fifty different values (or none). */
  distinctValues: string[];
  distinctCounts: number[];
}

export function summariseColumns(sheet: ReadSheet): ColumnSummary[] {
  return sheet.header.map((header, position) => {
    const counts = new Map<string, number>();
    const samples: string[] = [];
    for (const row of sheet.rows) {
      const cell = row.cells[position] ?? null;
      if (cell === null) continue;
      if (samples.length < 3) samples.push(cell.slice(0, MAX_KEPT_TEXT));
      if (counts.size <= MAX_LISTED_VALUES || counts.has(cell)) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
    // Sorted by count, then as first seen (a stable sort keeps the Map's order).
    const listed = counts.size <= MAX_LISTED_VALUES ? [...counts].sort((a, b) => b[1] - a[1]) : [];
    return {
      position,
      header: header.slice(0, MAX_KEPT_TEXT),
      samples,
      distinctValues: listed.map(([value]) => value),
      distinctCounts: listed.map(([, count]) => count),
    };
  });
}
