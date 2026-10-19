// The lead export's rows (B37, B38, B41; D27): the Leads list as the person sees it, newest first, 1,000 leads a page by
// keyset. A page is leadListQuery's ids, then the columns the list doesn't select, then the next follow-ups and
// destination names, all in one transaction; the owners' names come from identity, outside it.
import {
  leadExportFilter,
  MAX_LEAD_EXPORT_ROWS,
  openLeadStages,
  type LeadExportFilter,
} from "@travel-crm/contracts/crm";
import type { ExportJobDependencies, ExportSource } from "../../exports/index.js";
import type { JsonValue } from "../../jobs/index.js";
import { destinationNames } from "../../catalog/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { nextOpenTasks } from "../../tasks/index.js";
import { filterFor } from "../lead-list.js";
import { exportCountQuery, leadExportRowsQuery, leadListQuery } from "../lead-list-query.js";
import { exportRowOf, leadExportColumns, type ExportedLead } from "./export-rows.js";

/** Leads in a page of the file (B41). */
const PAGE_SIZE = 1000;

type ListedLead = Omit<
  ExportedLead,
  | "email"
  | "instagramHandle"
  | "childrenAges"
  | "departureCity"
  | "tripType"
  | "hotelCategory"
  | "food"
  | "roomType"
  | "sourceDetail"
> & { childrenCount: number };
type ExtraColumns = Pick<
  ExportedLead,
  | "id"
  | "email"
  | "instagramHandle"
  | "childrenAges"
  | "departureCity"
  | "tripType"
  | "hotelCategory"
  | "food"
  | "roomType"
  | "sourceDetail"
>;

/** The list's own filter for this person: their scope first (a salesperson's own leads whatever they asked). */
function listFilter(access: MemberAccess, filter: LeadExportFilter) {
  return {
    ...filterFor(access, filter),
    stages: filter.stage === "open" ? openLeadStages : [filter.stage],
  };
}

/** The filter's ids and fixed values: everything but the search, which holds a customer's name or phone. */
function fixedValues(filter: LeadExportFilter): Record<string, string> {
  const { view, stage, ownerUserId, source, destinationId, tripType } = filter;
  return {
    view,
    stage,
    ...(ownerUserId === undefined ? {} : { ownerUserId }),
    ...(source === undefined ? {} : { source }),
    ...(destinationId === undefined ? {} : { destinationId }),
    ...(tripType === undefined ? {} : { tripType }),
  };
}

/** maxRows defaults to MAX_LEAD_EXPORT_ROWS; a test passes a small one. */
export function leadExportSource(
  dependencies: ExportJobDependencies,
  options: { timeZone: string; maxRows?: number },
): ExportSource<LeadExportFilter> {
  const { timeZone } = options;
  return {
    kind: "leads",
    requires: "leads:view",
    sheetName: "Leads",
    columns: leadExportColumns,
    fileName: (stamp, format) => `leads-${stamp.day}-${stamp.time.replace(":", "")}.${format}`,
    filterOf: (stored) => leadExportFilter.parse(stored),
    maxRows: options.maxRows ?? MAX_LEAD_EXPORT_ROWS,
    count: async (context, access, filter) => {
      const [counted] = await context.forOrg((tx) =>
        tx.$queryRaw<{ n: number }[]>(exportCountQuery(listFilter(access, filter))),
      );
      return counted?.n ?? 0;
    },
    page: async (context, access, filter, after) => {
      const { listed, extras, names, next } = await context.forOrg(async (tx) => {
        // One more than a page tells whether another follows.
        const found = await tx.$queryRaw<ListedLead[]>(
          leadListQuery({
            ...listFilter(access, filter),
            ...(after === null ? {} : { before: after }),
            limit: PAGE_SIZE + 1,
          }),
        );
        const listed = found.slice(0, PAGE_SIZE);
        const ids = listed.map((lead) => lead.id);
        const extras = await tx.$queryRaw<ExtraColumns[]>(leadExportRowsQuery(ids));
        const destinationIds = new Set(
          listed.flatMap((lead) => (lead.destinationId === null ? [] : [lead.destinationId])),
        );
        return {
          listed,
          extras: new Map(extras.map((extra) => [extra.id, extra])),
          names: {
            destinations: await destinationNames(tx, [...destinationIds]),
            tasks: await nextOpenTasks(tx, "lead", ids),
          },
          next: found.length > PAGE_SIZE ? (listed.at(-1)?.id ?? null) : null,
        };
      });
      const ownerIds = [...new Set(listed.flatMap((lead) => (lead.ownerUserId === null ? [] : [lead.ownerUserId])))];
      const owners = await dependencies.identity.memberContacts(access.organizationId, ownerIds);
      const ownerNames = new Map(owners.map((owner) => [owner.userId, owner.name]));
      const rows = listed.flatMap((lead) => {
        const extra = extras.get(lead.id);
        if (extra === undefined) return [];
        return [
          exportRowOf(
            { ...lead, ...extra },
            {
              timeZone,
              appUrl: dependencies.appUrl,
              destinationNames: names.destinations,
              ownerNames,
              nextTask: names.tasks.get(lead.id),
            },
          ),
        ];
      });
      return { rows, next };
    },
    auditFilter: (filter): JsonValue => ({
      ...fixedValues(filter),
      ...(filter.search === undefined ? {} : { searched: true }),
    }),
    keptFilter: fixedValues,
  };
}
