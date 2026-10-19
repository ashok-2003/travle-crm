// Finding a sheet's matched columns by their header, never by position (S11, S15): a column inserted or moved changes
// nothing; a matched column that has gone stops the check only when it leaves no name, or no phone, email or Instagram.
import type { ImportField } from "@travel-crm/contracts/imports";
import type { SheetField } from "@travel-crm/contracts/sheets";
import type { ColumnMatches } from "../imports/index.js";
import { matchedFields } from "./columns.js";
import { type Bytes, rowHash } from "./hashes.js";
import { nameColumns } from "./header-keys.js";

export interface SheetColumnRow {
  headerKey: string;
  header: string;
  field: SheetField | null;
  isNew: boolean;
}

export interface HeaderMatch {
  /** The matched fields at the positions the header has them now. */
  matches: ColumnMatches;
  /** Matched columns the header no longer has. */
  missing: SheetColumnRow[];
  /** Headers with no column row: the sheet gained them. */
  unseen: { header: string; headerKey: string }[];
  positionOf: ReadonlyMap<string, number>;
}

/** SHA-256 of the header's trimmed cells: a change asks for a full read (S18). */
export function headerHashOf(header: readonly string[]): Bytes {
  return rowHash(header);
}

/** S11: the header read now, set against the columns the sheet was matched with. */
export function matchHeader(header: readonly string[], columns: readonly SheetColumnRow[]): HeaderMatch {
  const named = nameColumns(header);
  const positionOf = new Map(named.map(({ key }, index) => [key, index]));
  const known = new Map(columns.map((column) => [column.headerKey, column]));
  const fieldOf = new Map<number, ImportField>();
  for (const [key, position] of positionOf) {
    const field = known.get(key)?.field ?? null;
    if (field !== null) fieldOf.set(position, field);
  }
  return {
    matches: {
      fieldOf,
      positionsOf: (field) => [...fieldOf].filter(([, matched]) => matched === field).map(([position]) => position),
    },
    missing: columns.filter((column) => column.field !== null && !positionOf.has(column.headerKey)),
    unseen: named
      .filter(({ key }) => !known.has(key))
      .map(({ header: name, key }) => ({ header: name, headerKey: key })),
    positionOf,
  };
}

const needed: ReadonlySet<SheetField> = new Set(["name", "phone", "email", "instagram"]);

/**
 * S15: the check stops, consuming no row, when what is missing leaves a row with no name, or no phone, email or
 * Instagram; any other missing column is only noted. Names the gone columns that mattered.
 */
export function stopsTheCheck(match: HeaderMatch, columns: readonly SheetColumnRow[]): { columns: string[] } | null {
  const present = columns.filter(
    (column) => column.field !== null && !match.missing.some((gone) => gone.headerKey === column.headerKey),
  );
  if (matchedFields(present).complete) return null;
  const gone = match.missing.filter((column) => column.field !== null && needed.has(column.field));
  return { columns: gone.map((column) => column.header) };
}
