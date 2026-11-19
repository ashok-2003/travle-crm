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
import { organizationTimeZone, scopeFilter, type MemberAccess } from "../identity/index.js";
import { periodStart } from "../kernel/index.js";
import { nextOpenTasks } from "../tasks/index.js";
import { leadCountsQuery, leadListQuery, leadTotalQuery, type LeadCountsFilter } from "./lead-list-query.js";
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

/**
 * Whose leads: the scope's rule first (scopeFilter: a salesperson's own, whatever they ask for), then for everyone
 * else their own for "mine", or the owner asked for, or everyone's.
 */
function ownerFor(access: MemberAccess, input: LeadCountsInput): string | null {
  const scoped = scopeFilter(access, "leads:view", "ownerUserId").ownerUserId;
  if (scoped !== undefined) return scoped;
  return input.view === "mine" ? access.userId : (input.ownerUserId ?? null);
}

/**
 * A search of four or more digits, counted as typed, with no letters is a phone search (R5). Leading zeros (a trunk
 * "0", an international "00") are then dropped, since stored numbers are E.164; all zeros stay as typed. Anything
 * else is a name.
 */
function searchFor(text: string | undefined): LeadCountsFilter["search"] {
  if (text === undefined) return undefined;
  const typed = text.replace(/\D/g, "");
  if (typed.length < 4 || /\p{L}/u.test(text)) return { kind: "name", text };
  const digits = typed.replace(/^0+/, "");
  return { kind: "digits", digits: digits === "" ? typed : digits };
}

export function filterFor(access: MemberAccess, input: LeadCountsInput, createdFrom?: Date): LeadCountsFilter {
  const search = searchFor(input.search);
  const ownerUserId = ownerFor(access, input);
  // The Unassigned queue is everyone's unowned leads; a salesperson, scoped to their own, never sees it.
  const unassigned = input.view === "unassigned" && ownerUserId === null;
  return {
    ownerUserId,
    ...(unassigned && { unassignedOnly: true as const }),
    ...(input.source === undefined ? {} : { source: input.source }),
    ...(input.destinationId === undefined ? {} : { destinationId: input.destinationId }),
    ...(input.tripType === undefined ? {} : { tripType: input.tripType }),
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(search === undefined ? {} : { search }),
  };
}

/** Where the "came in" filter starts, read in the agency's zone only when one is asked for. */
async function createdFromOf(
  tx: OrgTx,
  access: MemberAccess,
  input: LeadCountsInput,
  now: Date,
): Promise<Date | undefined> {
  if (input.created === undefined) return undefined;
  const timeZone = await organizationTimeZone(tx, access.organizationId);
  return periodStart(input.created, now, timeZone) ?? undefined;
}

function itemOf(
  row: LeadListRow,
  names: ReadonlyMap<string, string>,
  next: Task | undefined,
): Omit<LeadListItem, "aiFilled"> {
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

/**
 * One page of leads, newest first; the router adds the owners' names. A numbered page starts (page - 1) × limit leads
 * in (after the cursor, when one is given too) and says how many leads match on every page; a page after a cursor
 * doesn't count them.
 */
export async function listLeads(
  tx: OrgTx,
  access: MemberAccess,
  input: ListLeadsInput,
  now = new Date(),
): Promise<Omit<LeadListPage, "people" | "items"> & { items: Omit<LeadListItem, "aiFilled">[] }> {
  const filter = {
    ...filterFor(access, input, await createdFromOf(tx, access, input, now)),
    stages: input.stage === "open" ? openLeadStages : [input.stage],
    ...(input.before === undefined ? {} : { before: input.before }),
  };
  // One more than a page tells whether another page follows.
  const rows = await tx.$queryRaw<LeadListRow[]>(
    leadListQuery({
      ...filter,
      ...(input.page === undefined ? {} : { offset: (input.page - 1) * input.limit }),
      limit: input.limit + 1,
    }),
  );
  const total =
    input.page === undefined ? null : ((await tx.$queryRaw<{ n: number }[]>(leadTotalQuery(filter)))[0]?.n ?? 0);
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
    total,
  };
}

/** Open leads by stage, for the same view and filters. */
export async function countLeads(
  tx: OrgTx,
  access: MemberAccess,
  input: LeadCountsInput,
  now = new Date(),
): Promise<LeadCounts> {
  const rows = await tx.$queryRaw<{ stage: string; n: number }[]>(
    leadCountsQuery(filterFor(access, input, await createdFromOf(tx, access, input, now))),
  );
  const counts: LeadCounts = { open: 0, new: 0, contacted: 0, quote_sent: 0, booking_requested: 0 };
  for (const { stage, n } of rows) {
    const open = openLeadStages.find((candidate) => candidate === stage);
    if (open === undefined) continue;
    counts[open] = n;
    counts.open += n;
  }
  return counts;
}
