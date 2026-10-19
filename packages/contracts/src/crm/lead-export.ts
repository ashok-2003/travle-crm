// A lead export's columns (spec B38): the header row, in order. The import's guesses know every one, so an export
// imports back. And what is asked for and followed: the Leads list's filter as the person saw it (B37), the format,
// and the export's page, which names the owner and the destination the filter holds.
import { z } from "zod";
import { exportDetail, exportFormat } from "../exports/data-export.js";
import { listLeadsInput } from "./leads.js";
import { recordId } from "../identity/fields.js";
import { peopleNames } from "./fields.js";

/** At most 1,00,000 leads in one file (B37): more stops the export. */
export const MAX_LEAD_EXPORT_ROWS = 100_000;

/** The list as the person sees it, without its paging: the export reads every page. */
export const leadExportFilter = listLeadsInput.omit({ before: true, limit: true });
export type LeadExportFilter = z.infer<typeof leadExportFilter>;

export const startLeadExportInput = z.strictObject({ filter: leadExportFilter, format: exportFormat });
export type StartLeadExportInput = z.infer<typeof startLeadExportInput>;

/** An export's page: its state, and the filter it was asked for (the search is emptied once the file is made). */
export const leadExportDetail = exportDetail.extend({
  filter: leadExportFilter,
  /** The owner the filter names. */
  people: peopleNames,
  destinationName: z.string().nullable(),
});
export type LeadExportDetail = z.infer<typeof leadExportDetail>;

export const leadExportHeaders = [
  "Name",
  "Phone",
  "Email",
  "Instagram",
  "Returning",
  "Stage",
  "Destination",
  "Travel from",
  "Travel to",
  "Travel month",
  "Adults",
  "Children's ages",
  "Budget",
  "Budget basis",
  "Departure city",
  "Trip type",
  "Hotel category",
  "Food",
  "Room type",
  "Owner",
  "Source",
  "Source detail",
  "Added on",
  "Next follow-up",
  "Next follow-up note",
  "Lead link",
] as const;
export type LeadExportHeader = (typeof leadExportHeaders)[number];

/** The names the dialog says what the file holds with: the owner and the destination a list's address names by id. */
export const leadExportNamesInput = z.strictObject({
  ownerUserId: recordId.optional(),
  destinationId: recordId.optional(),
});
export type LeadExportNamesInput = z.infer<typeof leadExportNamesInput>;

export const leadExportNames = z.object({ people: peopleNames, destinationName: z.string().nullable() });
export type LeadExportNames = z.infer<typeof leadExportNames>;
