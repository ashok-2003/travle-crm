// A sheet row read into an enquiry (S21, S22): the lead import's own reading with the sheet as its origin. The source is
// Google Sheet with the sheet's name and tab; an enquiry date reads with its time in the sheet's zone; a date a
// month-first sheet makes ambiguous is not trusted, the lead is added now and the cell goes into the note; the stage is
// always New; the owner is the Owner column's value, else the agency Owner.
import type { SheetOrigin } from "@travel-crm/contracts/imports";
import type { CalendarDate } from "../../kernel/index.js";
import { nameColumns, type HeaderMatch, type ReadRow } from "../../sheets/index.js";
import { readLeadRow, type LeadRowContext, type LeadRowReading } from "../lead-import/lead-row.js";

export interface SheetLeadContextInput {
  /** The header as read now. */
  header: readonly string[];
  match: HeaderMatch;
  /** Each Owner value's lead worker (a hand-made match, else the automatic one); null or absent: the agency Owner. */
  ownerTargets: ReadonlyMap<string, string | null>;
  defaultOwnerUserId: string;
  origin: SheetOrigin;
  today: CalendarDate;
  agencyTimeZone: string;
}

export function sheetLeadContext(input: SheetLeadContextInput): LeadRowContext {
  return {
    columns: input.match.matches,
    // A Note column's lines are labelled with its own header, named as the reader names it.
    headers: nameColumns(input.header).map(({ header }) => header),
    ownerOf: (value) => input.ownerTargets.get(value) ?? null,
    stageOf: () => null,
    defaults: { stage: "new", ownerUserId: input.defaultOwnerUserId, budgetBasis: "for_everyone" },
    fileName: input.origin.detail,
    today: input.today,
    timeZone: input.agencyTimeZone,
    origin: input.origin,
  };
}

/** One row of a sheet as an enquiry, or the reasons it isn't one. */
export function readSheetRow(row: ReadRow, context: LeadRowContext): LeadRowReading {
  return readLeadRow({ rowNumber: row.rowNumber, cells: row.cells }, context);
}
