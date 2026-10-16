// The lead list and its stage counts (spec 3.3): a salesperson's own leads whatever they ask for, a manager's own or
// everyone's, filtered and searched (R5), with each row's next step: waiting for a reply since it came while New, and
// its earliest open follow-up or task.
import {
  leadSource,
  leadStage,
  openLeadStages,
  type LeadCounts,
  type LeadCountsInput,
  type LeadListItem,
  type LeadListPage,
  type ListLeadsInput,
} from "@travel-crm/contracts/crm";
import type { Task } from "@travel-crm/contracts/tasks";
import type { OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { nextOpenTasks } from "../tasks/index.js";
import { leadCountsQuery, leadListQuery, type LeadCountsFilter } from "./lead-list-query.js";
import { budgetOf, tripSummaryOf, type TripColumns } from "./trip-columns.js";

/** A row of leadListQuery. */
interface LeadListRow extends Pick<
  TripColumns,
  | "destinationId"
  | "travelKind"
  | "travelStart"
  | "travelEnd"
  | "travelMonth"
  | "adults"
  | "budgetPaise"
  | "budgetBasis"
> {
  id: string;
  stage: string;
  returning: boolean;
  ownerUserId: string | null;
  source: string;
  createdAt: Date;
  childrenCount: number;
  personName: string;
  personPhone: string | null;
}

/** Whose leads: a salesperson's own always; a manager's own for "mine", else the owner asked for or everyone's. */
function ownerFor(access: MemberAccess, input: LeadCountsInput): string | null {
  const scope = access.permissions.scopeOf("leads:view");
  if (scope === null) throw new DomainError("FORBIDDEN", "MISSING_PERMISSION", "Requires leads:view");
  if (scope === "own" || input.view === "mine") return access.userId;
  return input.ownerUserId ?? null;
}

/**
 * A search with four or more digits and no letters is a phone search (R5); leading zeros (a trunk "0", an
 * international "00") are dropped, since stored numbers are E.164. Anything else is a name.
 */
function searchFor(text: string | undefined): LeadCountsFilter["search"] {
  if (text === undefined) return undefined;
  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length >= 4 && !/\p{L}/u.test(text)) return { kind: "digits", digits };
  return { kind: "name", text };
}

function filterFor(access: MemberAccess, input: LeadCountsInput): LeadCountsFilter {
  const search = searchFor(input.search);
  return {
    ownerUserId: ownerFor(access, input),
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.destinationId === undefined ? {} : { destinationId: input.destinationId }),
    ...(input.tripType === undefined ? {} : { tripType: input.tripType }),
    ...(search === undefined ? {} : { search }),
  };
}

function itemOf(row: LeadListRow, names: ReadonlyMap<string, string>, next: Task | undefined): LeadListItem {
  const stage = leadStage.parse(row.stage);
  return {
    id: row.id,
    person: { name: row.personName, phone: row.personPhone },
    returning: row.returning,
    stage,
    trip: tripSummaryOf(row, names),
    source: leadSource.parse(row.source),
    ownerUserId: row.ownerUserId,
    budget: budgetOf(row),
    createdAt: row.createdAt.toISOString(),
    next: {
      awaitingReplySince: stage === "new" ? row.createdAt.toISOString() : null,
      task: next === undefined ? null : { id: next.id, kind: next.kind, title: next.title, dueAt: next.dueAt },
    },
  };
}

/** One page of leads, newest first; the router adds the owners' names. */
export async function listLeads(
  tx: OrgTx,
  access: MemberAccess,
  input: ListLeadsInput,
): Promise<Omit<LeadListPage, "people">> {
  const stages = input.stage === "open" ? openLeadStages : [input.stage];
  // One more than a page tells whether another page follows.
  const rows = await tx.$queryRaw<LeadListRow[]>(
    leadListQuery({
      ...filterFor(access, input),
      stages,
      ...(input.before === undefined ? {} : { before: input.before }),
      limit: input.limit + 1,
    }),
  );
  const page = rows.slice(0, input.limit);
  const destinationIds = [...new Set(page.flatMap((row) => (row.destinationId === null ? [] : [row.destinationId])))];
  const names = await destinationNames(tx, destinationIds);
  const next = await nextOpenTasks(
    tx,
    "lead",
    page.map((row) => row.id),
  );
  return {
    items: page.map((row) => itemOf(row, names, next.get(row.id))),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** Open leads by stage, for the same view and filters. */
export async function countLeads(tx: OrgTx, access: MemberAccess, input: LeadCountsInput): Promise<LeadCounts> {
  const rows = await tx.$queryRaw<{ stage: string; n: number }[]>(leadCountsQuery(filterFor(access, input)));
  const counts: LeadCounts = { open: 0, new: 0, contacted: 0, quote_sent: 0, booking_requested: 0 };
  for (const { stage, n } of rows) {
    const open = openLeadStages.find((candidate) => candidate === stage);
    if (open === undefined) continue;
    counts[open] = n;
    counts.open += n;
  }
  return counts;
}
