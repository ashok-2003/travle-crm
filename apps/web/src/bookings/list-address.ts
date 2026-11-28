// The Bookings list's place in the address (R41; bookings revamp, 2026-11-27): the status chip (?status=, "claims" for the
// payments to check), the Filters' travel dates, salesperson and payment (?from=&to=&salesperson=&payment=), the sort
// (?sort=&direction=), the page and its size (?page=2&size=50). The list starts on All, by travel date soonest first,
// page 1 of 25. A member who sees only their own bookings has no salesperson to choose. The search never goes here
// (use-table-search.ts keeps it in the tab).
import {
  bookingPaymentState,
  bookingTablePageInput,
  bookingTableSort,
  type BookingPaymentState,
  type BookingTablePageInput,
  type BookingTableSort,
} from "@travel-crm/contracts/bookings";
import { recordId } from "@travel-crm/contracts/identity";
import { calendarDate, sortDirection, type SortDirection } from "@travel-crm/contracts/kernel";
import { z } from "zod";
import { readTableAddress, tableAddressHref, type AddressFields } from "@/components/data-table/table-address";
import { routes } from "@/lib/routes";

/** The status chips over the list: every booking, one status, or those with a payment to check. */
export const bookingChips = ["all", "requested", "confirmed", "completed", "cancelled", "claims"] as const;
export type BookingChip = (typeof bookingChips)[number];

export interface BookingsAddress {
  chip: BookingChip;
  travelFrom?: string | undefined;
  travelTo?: string | undefined;
  ownerUserId?: string | undefined;
  payment?: BookingPaymentState | undefined;
  sort: BookingTableSort;
  direction: SortDirection;
  page: number;
  limit: BookingTablePageInput["limit"];
}

export const bookingsStart: BookingsAddress = { chip: "all", sort: "upcoming", direction: "asc", page: 1, limit: 25 };

const fields: AddressFields<BookingsAddress> = {
  chip: { name: "status", schema: z.enum(bookingChips) },
  travelFrom: { name: "from", schema: calendarDate },
  travelTo: { name: "to", schema: calendarDate },
  ownerUserId: { name: "salesperson", schema: recordId },
  payment: { name: "payment", schema: bookingPaymentState },
  sort: { name: "sort", schema: bookingTableSort },
  direction: { name: "direction", schema: sortDirection },
  page: { name: "page", schema: z.coerce.number().pipe(bookingTablePageInput.shape.page) },
  limit: { name: "size", schema: z.coerce.number().pipe(bookingTablePageInput.shape.limit.unwrap()) },
};

/** What the address says, read with the api's rules; a member who sees only their own has no salesperson. */
export function readBookingsAddress(params: Pick<URLSearchParams, "get">, ownOnly: boolean): BookingsAddress {
  const address = readTableAddress(params, fields, bookingsStart);
  return ownOnly ? { ...address, ownerUserId: undefined } : address;
}

/** The list at this place: "/bookings?status=confirmed&page=2", only what differs from the start. */
export function bookingsHref(address: Partial<BookingsAddress>): string {
  return tableAddressHref(routes.bookings, fields, address, bookingsStart);
}

/** The api's input for the list at this place, with the search when there is one. */
export function tableInputOf(address: BookingsAddress, search: string): BookingTablePageInput {
  const { chip, travelFrom, travelTo, ownerUserId, payment, sort, direction, page, limit } = address;
  return {
    page,
    limit,
    sort,
    direction,
    ...(chip === "claims" ? { claimsPending: true } : chip === "all" ? {} : { status: chip }),
    ...(travelFrom !== undefined && { travelFrom }),
    ...(travelTo !== undefined && { travelTo }),
    ...(ownerUserId !== undefined && { ownerUserId }),
    ...(payment !== undefined && { payment }),
    ...(search !== "" && { search }),
  };
}

/** Whether the list shows less than every booking: a chip, a filter or a search. */
export function isFiltered(address: BookingsAddress, search: string): boolean {
  const { chip, travelFrom, travelTo, ownerUserId, payment } = address;
  return chip !== "all" || search !== "" || [travelFrom, travelTo, ownerUserId, payment].some(Boolean);
}
