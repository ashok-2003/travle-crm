// A sheet's columns (S11-S13): what a field needs, the guesses of a header's field, and a column row as the module reads it.
import { sheetFields, type SheetField } from "@travel-crm/contracts/sheets";
import type { ImportField } from "@travel-crm/contracts/imports";

const sheetFieldSet: ReadonlySet<string> = new Set(sheetFields);

/** A lead import field as a sheet's, or null when it is not one (a remembered Stage, or a staff file's field). */
export function asSheetField(field: ImportField | null): SheetField | null {
  return field !== null && sheetFieldSet.has(field) ? (field as SheetField) : null;
}

/** What a sheet row needs to become a lead (S13): a Name, and one of Phone, Email and Instagram. */
export function matchedFields(columns: readonly { field: SheetField | null }[]): {
  complete: boolean;
  missing: ("name" | "contact")[];
} {
  const fields = new Set(columns.flatMap((column) => column.field ?? []));
  const missing: ("name" | "contact")[] = [];
  if (!fields.has("name")) missing.push("name");
  if (!fields.has("phone") && !fields.has("email") && !fields.has("instagram")) missing.push("contact");
  return { complete: missing.length === 0, missing };
}
