// The bookings export's rows (bookings revamp, 2026-11-27): the Bookings list as the person sees it, by the table's own
// filter (matchingBookings: their scope first, the payment state by the domain's rule), in its order, travel date
// soonest first and no date last. The count reads the matching ids once, so every page holds the bookings counted; a
// page is the table's items for 1,000 of them, with their customers' phones, and the salespeople's names from identity.
import { bookingExportFilter, MAX_BOOKING_EXPORT_ROWS, type BookingExportFilter } from "@travel-crm/contracts/bookings";
import type { ExportJobDependencies, ExportSource } from "../../exports/index.js";
import type { JsonValue } from "../../jobs/index.js";
import { calendarDateIn } from "../../kernel/index.js";
import { bookingTableItemsOf, matchingBookings } from "../table-page.js";
import { bookingExportColumns, bookingExportRowOf } from "./export-rows.js";

/** Bookings in a page of the file. */
const PAGE_SIZE = 1000;

/** The list's own order. */
const LIST_ORDER = { sort: "travel", direction: "asc" } as const;

/** The filter's ids and fixed values: everything but the search, which holds a customer's name or phone. */
function fixedValues(filter: BookingExportFilter): Record<string, string | boolean> {
  const { status, claimsPending, travelFrom, travelTo, ownerUserId, payment } = filter;
  return {
    ...(status === undefined ? {} : { status }),
    ...(claimsPending === undefined ? {} : { claimsPending }),
    ...(travelFrom === undefined ? {} : { travelFrom }),
    ...(travelTo === undefined ? {} : { travelTo }),
    ...(ownerUserId === undefined ? {} : { ownerUserId }),
    ...(payment === undefined ? {} : { payment }),
  };
}

/** maxRows defaults to MAX_BOOKING_EXPORT_ROWS and pageSize to a page of 1,000; a test passes small ones. */
export function bookingExportSource(
  dependencies: ExportJobDependencies,
  options: { timeZone: string; maxRows?: number; pageSize?: number },
): ExportSource<BookingExportFilter> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? MAX_BOOKING_EXPORT_ROWS;
  // The agency's today, which decides what is overdue, and the bookings the count found: one run's.
  const today = calendarDateIn(new Date(), options.timeZone);
  let chosen: string[] = [];
  return {
    kind: "bookings",
    requires: "bookings:view",
    sheetName: "Bookings",
    columns: bookingExportColumns,
    fileName: (stamp, format) => `bookings-${stamp.day}-${stamp.time.replace(":", "")}.${format}`,
    filterOf: (stored) => bookingExportFilter.parse(stored),
    maxRows,
    count: (context, access, filter) =>
      context.forOrg(async (tx) => {
        // One past the limit is enough to know the file would be too long.
        const found = await matchingBookings(tx, access, filter, LIST_ORDER, today, { offset: 0, limit: maxRows + 1 });
        chosen = found.ids;
        return found.total;
      }),
    page: async (context, access, _filter, after) => {
      const offset = after === null ? 0 : Number(after);
      const ids = chosen.slice(offset, offset + pageSize);
      const { items, phones } = await context.forOrg(async (tx) => {
        const people = await tx.booking.findMany({
          where: { id: { in: ids } },
          select: { id: true, lead: { select: { person: { select: { phoneE164: true } } } } },
        });
        return {
          items: await bookingTableItemsOf(tx, ids, today),
          phones: new Map(people.map((row) => [row.id, row.lead.person.phoneE164])),
        };
      });
      const ownerIds = [...new Set(items.flatMap((item) => (item.ownerUserId === null ? [] : [item.ownerUserId])))];
      const owners = await dependencies.identity.memberContacts(access.organizationId, ownerIds);
      const names = new Map(owners.map((owner) => [owner.userId, owner.name]));
      const rows = items.map((item) =>
        bookingExportRowOf(item, {
          appUrl: dependencies.appUrl,
          phone: phones.get(item.id) ?? null,
          salesperson: item.ownerUserId === null ? null : (names.get(item.ownerUserId) ?? "Former member"),
        }),
      );
      const next = offset + pageSize;
      return { rows, next: next < chosen.length ? String(next) : null };
    },
    auditFilter: (filter): JsonValue => ({
      ...fixedValues(filter),
      ...(filter.search === undefined || filter.search === "" ? {} : { searched: true }),
    }),
    keptFilter: fixedValues,
  };
}
