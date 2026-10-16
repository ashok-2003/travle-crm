// The lead list's filters, kept in the address (R41: ?view=&stage=&owner=&source=&destination=&tripType=&q=) so Back
// from a lead and a shared link keep them. They are read with the api's own rules: a value it would refuse is left
// out, and a salesperson, who only ever sees their own leads, has no view or owner to choose.
import { leadSource, leadStage, listLeadsInput, tripType, type ListLeadsInput } from "@travel-crm/contracts/crm";
import { recordId } from "@travel-crm/contracts/identity";
import type { z } from "zod";
import { leadRoute, routes } from "@/lib/routes";

export const LEADS_PER_PAGE = 25;

/** What the address says: the list's input without its paging. */
export type ListFilters = Omit<ListLeadsInput, "before" | "limit">;

/** Filters to write into an address: any may be left out, or given as nothing (undefined, or an empty search). */
export type FiltersToShow = { [Key in keyof ListFilters]?: ListFilters[Key] | undefined };

/** Each filter's name in the address. */
const names = {
  view: "view",
  stage: "stage",
  ownerUserId: "owner",
  source: "source",
  destinationId: "destination",
  tripType: "tripType",
  search: "q",
} as const satisfies Record<keyof ListFilters, string>;

const searchText = listLeadsInput.shape.search.unwrap();

export function listFiltersOf(search: Pick<URLSearchParams, "get">, scope: "own" | "all"): ListLeadsInput {
  const read = <Output>(schema: z.ZodType<Output>, name: keyof ListFilters): Output | undefined => {
    const parsed = schema.safeParse(search.get(names[name]));
    return parsed.success ? parsed.data : undefined;
  };
  const everyone = scope === "all" && search.get(names.view) === "everyone";
  const ownerUserId = everyone ? read(recordId, "ownerUserId") : undefined;
  const source = read(leadSource, "source");
  const destinationId = read(recordId, "destinationId");
  const kind = read(tripType, "tripType");
  const text = read(searchText, "search");
  return {
    view: everyone ? "everyone" : "mine",
    stage: search.get(names.stage) === "open" ? "open" : (read(leadStage, "stage") ?? "open"),
    ...(ownerUserId && { ownerUserId }),
    ...(source && { source }),
    ...(destinationId && { destinationId }),
    ...(kind && { tripType: kind }),
    ...(text && { search: text }),
    limit: LEADS_PER_PAGE,
  };
}

/** The filters as a query string ("?view=everyone&stage=new"), only what differs from Mine · open; "" for none. */
function queryOf(filters: FiltersToShow): string {
  const query = new URLSearchParams();
  for (const [key, name] of Object.entries(names) as [keyof ListFilters, string][]) {
    const value = filters[key];
    if (value === undefined || value === "") continue;
    if ((key === "view" && value === "mine") || (key === "stage" && value === "open")) continue;
    query.set(name, value);
  }
  const text = query.toString();
  return text === "" ? "" : `?${text}`;
}

/** The list showing these filters. */
export function listFiltersHref(filters: FiltersToShow): string {
  return `${routes.leads}${queryOf(filters)}`;
}

/** A lead's page, carrying the list's filters for its way back. */
export function leadHref(leadId: string, filters: FiltersToShow): string {
  return `${leadRoute(leadId)}${queryOf(filters)}`;
}

/** Whether the list shows less than all of the view's open leads. */
export function isFiltered(filters: ListFilters): boolean {
  const { ownerUserId, source, destinationId, tripType: kind, search } = filters;
  return filters.stage !== "open" || [ownerUserId, source, destinationId, kind, search].some(Boolean);
}
