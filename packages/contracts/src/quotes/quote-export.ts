// The Quotes list as a file (bookings revamp, 2026-11-27): the list's filter as the person saw it (its search, status
// chip and Filters, without its page, size or sort), the format, and the export's page, which names the salesperson the
// filter holds. The file is in the list's own order, last changed first.
import { z } from "zod";
import { exportDetail, exportFormat } from "../exports/data-export.js";
import { quoteTablePageInput } from "./quotes.js";

/** At most 1,00,000 quotes in one file: more stops the export. */
export const MAX_QUOTE_EXPORT_ROWS = 100_000;

export const quoteExportFilter = quoteTablePageInput.omit({ page: true, limit: true, sort: true, direction: true });
export type QuoteExportFilter = z.infer<typeof quoteExportFilter>;

export const startQuoteExportInput = z.strictObject({ filter: quoteExportFilter, format: exportFormat });
export type StartQuoteExportInput = z.infer<typeof startQuoteExportInput>;

/** An export's page: its state, the filter it was asked for (the search emptied once the file is made), the salesperson. */
export const quoteExportDetail = exportDetail.extend({
  filter: quoteExportFilter,
  salespersonName: z.string().nullable(),
});
export type QuoteExportDetail = z.infer<typeof quoteExportDetail>;
