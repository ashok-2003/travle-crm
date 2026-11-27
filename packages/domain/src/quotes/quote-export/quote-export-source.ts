// The quotes export's rows (bookings revamp, 2026-11-27): the Quotes list as the person sees it, by the table's own
// filter (matchingQuotes: their scope first), in its order, last changed first. The count reads the matching ids once, so
// every page holds the quotes counted; a page is the table's items for 1,000 of them, with their customers' phones and
// what the AI's bookings make them wait for (the ai module's paymentWaits, which the worker hands in: quotes can't call
// it), and the salespeople's names from identity.
import { MAX_QUOTE_EXPORT_ROWS, quoteExportFilter, type QuoteExportFilter } from "@travel-crm/contracts/quotes";
import type { QuotePaymentWait } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import type { ExportJobDependencies, ExportSource } from "../../exports/index.js";
import type { JsonValue } from "../../jobs/index.js";
import { matchingQuotes, quoteTableItemsOf } from "../table-page.js";
import { quoteExportColumns, quoteExportRowOf } from "./export-rows.js";

/** Quotes in a page of the file. */
const PAGE_SIZE = 1000;

/** The list's own order. */
const LIST_ORDER = { sort: "updated", direction: "desc" } as const;

/** Which of these quotes wait for a payment, and how: the ai module's paymentWaitsOf. */
export type PaymentWaits = (
  tx: OrgTx,
  quoteIds: readonly string[],
  now: Date,
) => Promise<Map<string, QuotePaymentWait>>;

/** The filter's ids and fixed values: everything but the search, which holds a customer's name or phone. */
function fixedValues(filter: QuoteExportFilter): Record<string, string | boolean> {
  const { status, balanceDue, travelFrom, travelTo, ownerUserId } = filter;
  return {
    ...(status === undefined ? {} : { status }),
    ...(balanceDue === undefined ? {} : { balanceDue }),
    ...(travelFrom === undefined ? {} : { travelFrom }),
    ...(travelTo === undefined ? {} : { travelTo }),
    ...(ownerUserId === undefined ? {} : { ownerUserId }),
  };
}

/** maxRows defaults to MAX_QUOTE_EXPORT_ROWS and pageSize to a page of 1,000; a test passes small ones. */
export function quoteExportSource(
  dependencies: ExportJobDependencies,
  options: { timeZone: string; paymentWaits: PaymentWaits; maxRows?: number; pageSize?: number },
): ExportSource<QuoteExportFilter> {
  const pageSize = options.pageSize ?? PAGE_SIZE;
  const maxRows = options.maxRows ?? MAX_QUOTE_EXPORT_ROWS;
  // The quotes the count found: one run's.
  let chosen: string[] = [];
  return {
    kind: "quotes",
    requires: "quotes:view",
    sheetName: "Quotes",
    columns: quoteExportColumns,
    fileName: (stamp, format) => `quotes-${stamp.day}-${stamp.time.replace(":", "")}.${format}`,
    filterOf: (stored) => quoteExportFilter.parse(stored),
    maxRows,
    count: (context, access, filter) =>
      context.forOrg(async (tx) => {
        // One past the limit is enough to know the file would be too long.
        const found = await matchingQuotes(tx, access, filter, LIST_ORDER, { offset: 0, limit: maxRows + 1 });
        chosen = found.ids;
        return found.total;
      }),
    page: async (context, access, _filter, after) => {
      const offset = after === null ? 0 : Number(after);
      const ids = chosen.slice(offset, offset + pageSize);
      const { items, phones, waits } = await context.forOrg(async (tx) => {
        const people = await tx.quote.findMany({
          where: { id: { in: ids } },
          select: { id: true, lead: { select: { person: { select: { phoneE164: true } } } } },
        });
        return {
          items: await quoteTableItemsOf(tx, ids),
          phones: new Map(people.map((row) => [row.id, row.lead.person.phoneE164])),
          waits: await options.paymentWaits(tx, ids, new Date()),
        };
      });
      const ownerIds = [...new Set(items.flatMap((item) => (item.ownerUserId === null ? [] : [item.ownerUserId])))];
      const owners = await dependencies.identity.memberContacts(access.organizationId, ownerIds);
      const names = new Map(owners.map((owner) => [owner.userId, owner.name]));
      const rows = items.map((item) =>
        quoteExportRowOf(item, {
          appUrl: dependencies.appUrl,
          timeZone: options.timeZone,
          phone: phones.get(item.id) ?? null,
          salesperson: item.ownerUserId === null ? null : (names.get(item.ownerUserId) ?? "Former member"),
          paymentWait: waits.get(item.id),
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
