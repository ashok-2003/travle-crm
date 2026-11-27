// The Bookings list as a file (bookings revamp, 2026-11-27): the list's filter as the person saw it (its search, status
// chip and Filters, without its page, size or sort), the format, and the export's page, which names the salesperson the
// filter holds. The file is in the list's own order, by travel date soonest first.
import { z } from "zod";
import { exportDetail, exportFormat } from "../exports/data-export.js";
import { bookingTablePageInput } from "./bookings.js";

/** At most 1,00,000 bookings in one file: more stops the export. */
export const MAX_BOOKING_EXPORT_ROWS = 100_000;

export const bookingExportFilter = bookingTablePageInput.omit({ page: true, limit: true, sort: true, direction: true });
export type BookingExportFilter = z.infer<typeof bookingExportFilter>;

export const startBookingExportInput = z.strictObject({ filter: bookingExportFilter, format: exportFormat });
export type StartBookingExportInput = z.infer<typeof startBookingExportInput>;

/** An export's page: its state, the filter it was asked for (the search emptied once the file is made), the salesperson. */
export const bookingExportDetail = exportDetail.extend({
  filter: bookingExportFilter,
  salespersonName: z.string().nullable(),
});
export type BookingExportDetail = z.infer<typeof bookingExportDetail>;
