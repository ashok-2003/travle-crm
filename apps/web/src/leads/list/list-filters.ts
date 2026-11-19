// The lead list's filters, kept in the address (R41: ?view=&stage=&owner=&source=&destination=&tripType=&created=) so Back
// from a lead and a shared link keep them, and the list's page and its size after them (?page=2&size=50), so Back and
// Forward walk the pages. They are read with the api's own rules: a value it would refuse is left out, and a
// salesperson, who only ever sees their own leads, has no view or owner to choose. Only ids and fixed values go there:
// the search, a name or a phone, never does (use-list-search.ts keeps it in the tab).
import { leadSource, leadStage, MAX_LEAD_PAGE, tripType, type ListLeadsInput } from "@travel-crm/contracts/crm";
import { recordId } from "@travel-crm/contracts/identity";
import { createdWithin } from "@travel-crm/contracts/kernel";
import type { z } from "zod";
import { leadRoute, routes } from "@/lib/routes";

export const LEADS_PER_PAGE = 20;
/** The page sizes Rows per page offers (owner, 2026-11-19: 20 by default). */
export const PAGE_SIZES = [10, 20, 50, 100] as const;

/** What the address says: the list's input without its paging or its search. */
export type ListFilters = Omit<ListLeadsInput, "before" | "page" | "limit" | "search">;

/** The list's filters and where in it the address is: a page, from 1, of `limit` leads. */
export type AddressedList = ListFilters & { page: number; limit: number };

/** Filters to write into an address: any may be left out, or given as nothing (undefined). */
export type FiltersToShow = { [Key in keyof AddressedList]?: AddressedList[Key] | undefined };

/** Each filter's name in the address, then the page's and its size's. */
const names = {
  view: "view",
  stage: "stage",
  ownerUserId: "owner",
  source: "source",
  destinationId: "destination",
  tripType: "tripType",
  created: "created",
  page: "page",
  limit: "size",
} as const satisfies Record<keyof AddressedList, string>;

/** A page number as the address writes it: digits, 1 to the furthest page the api reads. */
function pageOf(text: string | null): number {
  const page = text !== null && /^\d+$/.test(text) ? Number(text) : 1;
  return page >= 1 && page <= MAX_LEAD_PAGE ? page : 1;
}

export function listFiltersOf(search: Pick<URLSearchParams, "get">, scope: "own" | "all"): AddressedList {
  const read = <Output>(schema: z.ZodType<Output>, name: keyof ListFilters): Output | undefined => {
    const parsed = schema.safeParse(search.get(names[name]));
    return parsed.success ? parsed.data : undefined;
  };
  const asked = search.get(names.view);
  // Everyone's and the Unassigned queue are for whoever sees all leads; anyone else sees their own.
  const queue = asked === "unassigned";
  const view = scope === "all" && (asked === "everyone" || queue) ? asked : "mine";
  const ownerUserId = view === "everyone" ? read(recordId, "ownerUserId") : undefined;
  const source = read(leadSource, "source");
  const destinationId = read(recordId, "destinationId");
  const kind = read(tripType, "tripType");
  const created = read(createdWithin, "created");
  return {
    view,
    stage: search.get(names.stage) === "open" ? "open" : (read(leadStage, "stage") ?? "open"),
    ...(ownerUserId && { ownerUserId }),
    ...(source && { source }),
    ...(destinationId && { destinationId }),
    ...(kind && { tripType: kind }),
    ...(created && { created }),
    page: pageOf(search.get(names.page)),
    limit: PAGE_SIZES.find((size) => String(size) === search.get(names.limit)) ?? LEADS_PER_PAGE,
  };
}

/** What the address leaves out, as the list starts there: Mine · open, page 1 of 20. */
const starts: Partial<Record<keyof AddressedList, string | number>> = {
  view: "mine",
  stage: "open",
  page: 1,
  limit: LEADS_PER_PAGE,
};

/** The filters as a query string ("?view=everyone&stage=new&page=2"), only what differs from the start; "" for none. */
function queryOf(filters: FiltersToShow): string {
  const query = new URLSearchParams();
  for (const [key, name] of Object.entries(names) as [keyof AddressedList, string][]) {
    const value = filters[key];
    if (value === undefined || value === "" || value === starts[key]) continue;
    query.set(name, String(value));
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/** The list showing these filters, at this page. */
export function listFiltersHref(filters: FiltersToShow): string {
  return `${routes.leads}${queryOf(filters)}`;
}

/** A lead's page, carrying the list's filters for its way back. */
export function leadHref(leadId: string, filters: FiltersToShow): string {
  return `${leadRoute(leadId)}${queryOf(filters)}`;
}

/** Whether the list shows less than all of the view's open leads. */
export function isFiltered(filters: ListFilters & { search?: string }): boolean {
  const { ownerUserId, source, destinationId, tripType: kind, created, search } = filters;
  return filters.stage !== "open" || [ownerUserId, source, destinationId, kind, created, search].some(Boolean);
}
