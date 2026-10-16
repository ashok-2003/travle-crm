// What Today reads from crm (spec 3.5, R35): one person's leads still in New, oldest first, as composable SQL over
// lead_new_by_owner (R11: the performance tests EXPLAIN the exact query), and the brief line each lead shows beside
// its task: the person's name and phone, the trip in one line and the source.
import { leadSource } from "@travel-crm/contracts/crm";
import type { LeadBrief } from "@travel-crm/contracts/today";
import { emptySql, sql, type OrgTx, type Sql } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import { tripColumnNames, tripSummaryOf } from "./trip-columns.js";

export interface NewLeadsWaitingFilter {
  ownerUserId: string;
  /** The last lead id of the previous page. */
  after?: string;
  limit: number;
}

/** A lead still waiting for its first reply, and since when: the moment it came in. */
export interface NewLeadWaiting {
  leadId: string;
  waitingSince: Date;
}

const newLeadsOf = (ownerUserId: string) =>
  sql`owner_user_id = ${ownerUserId}::uuid AND stage = 'new' AND deleted_at IS NULL`;

/** One page of the owner's leads in New, oldest first (UUID v7 ids are in the order they were made). */
export function newLeadsWaitingQuery(filter: NewLeadsWaitingFilter): Sql {
  const afterCursor = filter.after === undefined ? emptySql : sql`AND id > ${filter.after}::uuid`;
  return sql`
    SELECT id AS "leadId", created_at AS "waitingSince" FROM lead
    WHERE ${newLeadsOf(filter.ownerUserId)} ${afterCursor}
    ORDER BY id
    LIMIT ${filter.limit}`;
}

export async function newLeadsWaiting(tx: OrgTx, filter: NewLeadsWaitingFilter): Promise<NewLeadWaiting[]> {
  return tx.$queryRaw<NewLeadWaiting[]>(newLeadsWaitingQuery(filter));
}

export async function countNewLeadsWaiting(tx: OrgTx, ownerUserId: string): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM lead WHERE ${newLeadsOf(ownerUserId)}`;
  return row?.n ?? 0;
}

/** The live leads among the ids, each in brief; a lead that is gone (erased) is left out. */
export async function leadBriefs(tx: OrgTx, leadIds: readonly string[]): Promise<Map<string, LeadBrief>> {
  if (leadIds.length === 0) return new Map();
  const leads = await tx.lead.findMany({
    where: { id: { in: [...new Set(leadIds)] } },
    select: { id: true, source: true, person: { select: { name: true, phoneE164: true } }, ...tripColumnNames },
  });
  const names = await destinationNames(
    tx,
    leads.flatMap((lead) => lead.destinationId ?? []),
  );
  return new Map(
    leads.map((lead) => [
      lead.id,
      {
        id: lead.id,
        personName: lead.person.name,
        phone: lead.person.phoneE164,
        trip: tripSummaryOf({ ...lead, childrenCount: lead.childrenAges.length }, names),
        source: leadSource.parse(lead.source),
      },
    ]),
  );
}
