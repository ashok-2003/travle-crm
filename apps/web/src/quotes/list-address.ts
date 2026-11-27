// The Quotes list's place in the address (R41; bookings revamp, 2026-11-27): the status chip (?status=, "due" for the
// accepted quotes with money still to come), the Filters' travel dates and salesperson (?from=&to=&salesperson=), the
// sort (?sort=&direction=), the page and its size (?page=2&size=50). The list starts on All, last changed first, page 1 of
// 25. A member who sees only their own quotes has no salesperson to choose. The search never goes here
// (use-table-search.ts keeps it in the tab).
import { recordId } from "@travel-crm/contracts/identity";
import { calendarDate, sortDirection, type SortDirection } from "@travel-crm/contracts/kernel";
import {
  quoteTablePageInput,
  quoteTableSort,
  type QuoteTablePageInput,
  type QuoteTableSort,
} from "@travel-crm/contracts/quotes";
import { z } from "zod";
import { readTableAddress, tableAddressHref, type AddressFields } from "@/components/data-table/table-address";
import { routes } from "@/lib/routes";

/** The status chips over the list: every quote, one status, or the accepted ones with money still to come. */
export const quoteChips = ["all", "draft", "sent", "accepted", "due"] as const;
export type QuoteChip = (typeof quoteChips)[number];

export interface QuotesAddress {
  chip: QuoteChip;
  travelFrom?: string | undefined;
  travelTo?: string | undefined;
  ownerUserId?: string | undefined;
  sort: QuoteTableSort;
  direction: SortDirection;
  page: number;
  limit: QuoteTablePageInput["limit"];
}

export const quotesStart: QuotesAddress = { chip: "all", sort: "updated", direction: "desc", page: 1, limit: 25 };

const fields: AddressFields<QuotesAddress> = {
  chip: { name: "status", schema: z.enum(quoteChips) },
  travelFrom: { name: "from", schema: calendarDate },
  travelTo: { name: "to", schema: calendarDate },
  ownerUserId: { name: "salesperson", schema: recordId },
  sort: { name: "sort", schema: quoteTableSort },
  direction: { name: "direction", schema: sortDirection },
  page: { name: "page", schema: z.coerce.number().pipe(quoteTablePageInput.shape.page) },
  limit: { name: "size", schema: z.coerce.number().pipe(quoteTablePageInput.shape.limit.unwrap()) },
};

/** What the address says, read with the api's rules; a member who sees only their own has no salesperson. */
export function readQuotesAddress(params: Pick<URLSearchParams, "get">, ownOnly: boolean): QuotesAddress {
  const address = readTableAddress(params, fields, quotesStart);
  return ownOnly ? { ...address, ownerUserId: undefined } : address;
}

/** The list at this place: "/quotes?status=sent&page=2", only what differs from the start. */
export function quotesHref(address: Partial<QuotesAddress>): string {
  return tableAddressHref(routes.quotes, fields, address, quotesStart);
}

/** The api's input for the list at this place, with the search when there is one. */
export function quoteInputOf(address: QuotesAddress, search: string): QuoteTablePageInput {
  const { chip, travelFrom, travelTo, ownerUserId, sort, direction, page, limit } = address;
  return {
    page,
    limit,
    sort,
    direction,
    ...(chip === "due" ? { balanceDue: true } : chip === "all" ? {} : { status: chip }),
    ...(travelFrom !== undefined && { travelFrom }),
    ...(travelTo !== undefined && { travelTo }),
    ...(ownerUserId !== undefined && { ownerUserId }),
    ...(search !== "" && { search }),
  };
}

/** Whether the list shows less than every quote: a chip, a filter or a search. */
export function isFiltered(address: QuotesAddress, search: string): boolean {
  const { chip, travelFrom, travelTo, ownerUserId } = address;
  return chip !== "all" || search !== "" || [travelFrom, travelTo, ownerUserId].some(Boolean);
}
