// What the lead-sheets tests share: a Google Form's columns matched, and a sheet row read in the sheet's own context.
import type { SheetOrigin } from "@travel-crm/contracts/imports";
import { parseCalendarDate } from "../../../src/kernel/index.js";
import { readSheetRow, sheetLeadContext } from "../../../src/crm/lead-sheets/index.js";
import { nameColumns } from "../../../src/sheets/header-keys.js";
import { matchHeader } from "../../../src/sheets/header-match.js";
import { numberRows } from "../../../src/sheets/numbered-rows.js";

export const formColumns = [
  ["Timestamp", "enquiry_date"],
  ["Full name", "name"],
  ["Phone number", "phone"],
  ["Email Address", "email"],
  ["Where do you want to go?", "destination"],
  ["Do you need visas?", "note"],
  ["Anything else?", "note"],
  ["Handled by", "owner"],
  ["How did you hear about us?", "their_source"],
] as const;

export const formHeader = formColumns.map(([header]) => header);

export const goaOrigin: SheetOrigin = {
  detail: "Goa Diwali campaign · Form responses 1",
  timeZone: "Asia/Kolkata",
  monthFirstDates: false,
};

/** A sheet row read in the context of the form's columns, as a check reads it. */
export function readFormRow(
  cells: string[],
  options: {
    origin?: SheetOrigin;
    today?: string;
    owners?: Record<string, string | null>;
    defaultOwner?: string;
    header?: readonly string[];
    fields?: readonly (readonly [string, string | null])[];
  } = {},
) {
  const header = options.header ?? formHeader;
  const fields = options.fields ?? formColumns;
  const columns = nameColumns(header).map(({ header: name, key }, index) => ({
    headerKey: key,
    header: name,
    field: (fields[index]?.[1] ?? null) as never,
    isNew: false,
  }));
  const match = matchHeader(header, columns);
  const context = sheetLeadContext({
    header,
    match,
    ownerTargets: new Map(Object.entries(options.owners ?? {})),
    defaultOwnerUserId: options.defaultOwner ?? "owner-1",
    origin: options.origin ?? goaOrigin,
    today: parseCalendarDate(options.today ?? "2026-10-20"),
    agencyTimeZone: "Asia/Kolkata",
  });
  const [row] = numberRows([{ rowNumber: 2, cells }]);
  if (row === undefined) throw new Error("A row of only blanks");
  return { reading: readSheetRow(row, context), row, context };
}
