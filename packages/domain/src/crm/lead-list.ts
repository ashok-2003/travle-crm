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
  type LeadShow,
  type ListLeadsInput,
} from "@travel-crm/contracts/crm";
import type { Task } from "@travel-crm/contracts/tasks";
import type { OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import { organizationTimeZone, scopeFilter, type MemberAccess } from "../identity/index.js";
import { periodStart, phoneSearchDigits } from "../kernel/index.js";
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
 * A Show's leads (leads show spec, 2026-11-21) in the order the list shows them, found by the module whose rule it is:
 * sales' hot leads, tasks' overdue follow-ups, inbox's New leads nobody contacted, the AI's needs. The list's view,
 * scope and filters still apply on top. `mineChosen`: the choice settled whose leads are Mine (AI needs a person's
 * holds the unowned ones too, for whoever manages the AI), so Mine takes them as they are; the scope still applies.
 */
export interface ChosenLeads {
  ids: readonly string[];
  mineChosen: boolean;
}

/** What finding a Show's leads needs of the list's input: the Show, and whose leads the tab and owner filter hold. */
export type ShowFilter = Pick<LeadCountsInput, "view" | "ownerUserId"> & { show: LeadShow };

/**
 * Whose leads: the scope's rule first (scopeFilter: a salesperson's own, whatever they ask for), then for everyone
 * else their own for "mine" (or whomever a Show chose), or the owner asked for, or everyone's.
 */
function ownerFor(access: MemberAccess, input: LeadCountsInput, chosen: ChosenLeads | undefined): string | null {
  const scoped = scopeFilter(access, "leads:view", "ownerUserId").ownerUserId;
  if (scoped !== undefined) return scoped;
  if (input.view === "mine") return chosen?.mineChosen === true ? null : access.userId;
  return input.ownerUserId ?? null;
}

/** A phone's search (phoneSearchDigits: four or more digits, no letters) looks in phones; anything else is a name. */
function searchFor(text: string | undefined): LeadCountsFilter["search"] {
  if (text === undefined) return undefined;
  const digits = phoneSearchDigits(text);
  return digits === null ? { kind: "name", text } : { kind: "digits", digits };
}

export function filterFor(
  access: MemberAccess,
  input: LeadCountsInput,
  createdFrom?: Date,
  chosen?: ChosenLeads,
): LeadCountsFilter {
  const search = searchFor(input.search);
  const ownerUserId = ownerFor(access, input, chosen);
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
    ...(chosen === undefined ? {} : { chosen: chosen.ids }),
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
 * in (after the cursor, when one is given too), says how many leads match on every page, and lists a Show's chosen
 * leads in their own order; a cursor's pages don't count them and stay newest first, as a cursor needs.
 */
export async function listLeads(
  tx: OrgTx,
  access: MemberAccess,
  input: ListLeadsInput,
  now = new Date(),
  chosen?: ChosenLeads,
): Promise<Omit<LeadListPage, "people" | "items"> & { items: Omit<LeadListItem, "aiFilled">[] }> {
  const filter = {
    ...filterFor(access, input, await createdFromOf(tx, access, input, now), chosen),
    stages: input.stage === "open" ? openLeadStages : [input.stage],
    ...(input.before === undefined ? {} : { before: input.before }),
    ...(chosen !== undefined && input.page !== undefined && { ranked: true as const }),
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

/** Open leads by stage, for the same view, filters and Show. */
export async function countLeads(
  tx: OrgTx,
  access: MemberAccess,
  input: LeadCountsInput,
  now = new Date(),
  chosen?: ChosenLeads,
): Promise<LeadCounts> {
  const rows = await tx.$queryRaw<{ stage: string; n: number }[]>(
    leadCountsQuery(filterFor(access, input, await createdFromOf(tx, access, input, now), chosen)),
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
