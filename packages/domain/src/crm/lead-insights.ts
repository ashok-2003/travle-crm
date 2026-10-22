// The dashboard's lead numbers (release B): the leads that came in during a period (its cohort), counted by source,
// stage, destination, wait for a first reply and owner; and the moves to Quote sent and Won during it, from the
// timeline. One owner's leads, or everyone's (null). Counts only, under row-level security; deleted leads never count.
// Live queries for now: a summary table (ADR 0028) takes over if they miss their time budget at 500 staff.
import { leadStages, type LeadSource, type LeadStage } from "@travel-crm/contracts/crm";
import type { ResponseBucket } from "@travel-crm/contracts/insights";
import { emptySql, sql, type OrgTx, type Sql } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";

export interface InsightsPeriod {
  /** The first instant of the period, and the instant after its last. */
  from: Date;
  to: Date;
  /** The agency's zone, in which a lead's day is counted. */
  timeZone: string;
}

export interface LeadInsights {
  newLeads: number;
  contacted: number;
  newLeadsWon: number;
  medianFirstReplyMinutes: number | null;
  quotesSent: number;
  won: number;
  open: number;
  /** New leads per day of the agency's zone (yyyy-mm-dd), only the days that had some. */
  perDay: { day: string; leads: number }[];
  bySource: { source: LeadSource; leads: number; won: number }[];
  byStage: { stage: LeadStage; leads: number }[];
  topDestinations: { name: string; leads: number }[];
  responseTimes: { bucket: ResponseBucket; leads: number }[];
  /** Per owner, most new leads first, at most ten; asked only for everyone's leads. */
  team: { userId: string; leads: number; contacted: number; won: number }[];
}

const TOP = 10;

/**
 * A lead that has had a reply: it left New for a stage but Not a lead (first_reply_at), or it was imported already past
 * New, when no first reply was recorded. Not a lead is junk, never contacted.
 */
const replied = sql`(lead.first_reply_at IS NOT NULL OR lead.stage NOT IN ('new', 'not_a_lead'))`;

/** The period's new leads: live, come in during it, and the owner's when one is given. */
function cohort(ownerUserId: string | null, period: InsightsPeriod): Sql {
  const owner = ownerUserId === null ? emptySql : sql`AND lead.owner_user_id = ${ownerUserId}::uuid`;
  return sql`lead.deleted_at IS NULL
    AND lead.created_at >= ${period.from}::timestamptz AND lead.created_at < ${period.to}::timestamptz ${owner}`;
}

export async function leadInsights(
  tx: OrgTx,
  ownerUserId: string | null,
  period: InsightsPeriod,
): Promise<LeadInsights> {
  const inCohort = cohort(ownerUserId, period);
  const owner = ownerUserId === null ? emptySql : sql`AND lead.owner_user_id = ${ownerUserId}::uuid`;

  const [totals] = await tx.$queryRaw<
    { newLeads: number; contacted: number; newLeadsWon: number; medianMinutes: number | null }[]
  >(sql`
    SELECT count(*)::int AS "newLeads",
      count(*) FILTER (WHERE ${replied})::int AS contacted,
      count(*) FILTER (WHERE lead.stage = 'won')::int AS "newLeadsWon",
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM lead.first_reply_at - lead.created_at) / 60)
        FILTER (WHERE lead.first_reply_at IS NOT NULL))::float8 AS "medianMinutes"
    FROM lead WHERE ${inCohort}`);

  // A lead moved there twice in the period (reopened) counts once.
  const [moves] = await tx.$queryRaw<{ quotesSent: number; won: number }[]>(sql`
    SELECT count(DISTINCT entry.lead_id) FILTER (WHERE entry.stage = 'quote_sent')::int AS "quotesSent",
      count(DISTINCT entry.lead_id) FILTER (WHERE entry.stage = 'won')::int AS won
    FROM lead_timeline_entry entry
    JOIN lead ON lead.organization_id = entry.organization_id AND lead.id = entry.lead_id
    WHERE entry.kind = 'stage-changed'
      AND entry.occurred_at >= ${period.from}::timestamptz AND entry.occurred_at < ${period.to}::timestamptz
      AND lead.deleted_at IS NULL ${owner}`);

  const [open] = await tx.$queryRaw<{ n: number }[]>(sql`
    SELECT count(*)::int AS n FROM lead
    WHERE lead.deleted_at IS NULL
      AND lead.stage = ANY (ARRAY['new', 'contacted', 'quote_sent', 'booking_requested']) ${owner}`);

  const perDay = await tx.$queryRaw<{ day: string; leads: number }[]>(sql`
    SELECT to_char(lead.created_at AT TIME ZONE ${period.timeZone}, 'YYYY-MM-DD') AS day, count(*)::int AS leads
    FROM lead WHERE ${inCohort} GROUP BY 1 ORDER BY 1`);

  const bySource = await tx.$queryRaw<{ source: LeadSource; leads: number; won: number }[]>(sql`
    SELECT lead.source, count(*)::int AS leads, count(*) FILTER (WHERE lead.stage = 'won')::int AS won
    FROM lead WHERE ${inCohort} GROUP BY lead.source ORDER BY leads DESC, lead.source`);

  const stageCounts = await tx.$queryRaw<{ stage: LeadStage; leads: number }[]>(sql`
    SELECT lead.stage, count(*)::int AS leads FROM lead WHERE ${inCohort} GROUP BY lead.stage`);
  const byStage = leadStages.map((stage) => ({
    stage,
    leads: stageCounts.find((row) => row.stage === stage)?.leads ?? 0,
  }));

  const destinations = await tx.$queryRaw<{ destinationId: string; leads: number }[]>(sql`
    SELECT lead.destination_id AS "destinationId", count(*)::int AS leads
    FROM lead WHERE ${inCohort} AND lead.destination_id IS NOT NULL
    GROUP BY lead.destination_id ORDER BY leads DESC, lead.destination_id LIMIT ${TOP}`);
  const names = await destinationNames(
    tx,
    destinations.map((row) => row.destinationId),
  );

  // Waiting is a lead still New. One past New with no first reply recorded (imported so) waited an unknown time, and
  // one marked Not a lead waited for nothing: neither is in a bucket.
  const responseTimes = await tx.$queryRaw<{ bucket: ResponseBucket; leads: number }[]>(sql`
    SELECT bucket, count(*)::int AS leads FROM (
      SELECT CASE
          WHEN lead.first_reply_at IS NULL THEN (CASE WHEN lead.stage = 'new' THEN 'waiting' END)
          WHEN lead.first_reply_at - lead.created_at < interval '15 minutes' THEN 'under15m'
          WHEN lead.first_reply_at - lead.created_at < interval '1 hour' THEN 'under1h'
          WHEN lead.first_reply_at - lead.created_at < interval '4 hours' THEN 'under4h'
          WHEN lead.first_reply_at - lead.created_at < interval '1 day' THEN 'under1d'
          ELSE 'later'
        END AS bucket
      FROM lead WHERE ${inCohort}
    ) waits WHERE bucket IS NOT NULL GROUP BY bucket`);

  const team =
    ownerUserId !== null
      ? []
      : await tx.$queryRaw<{ userId: string; leads: number; contacted: number; won: number }[]>(sql`
          SELECT lead.owner_user_id AS "userId", count(*)::int AS leads,
            count(*) FILTER (WHERE ${replied})::int AS contacted,
            count(*) FILTER (WHERE lead.stage = 'won')::int AS won
          FROM lead WHERE ${inCohort} AND lead.owner_user_id IS NOT NULL
          GROUP BY lead.owner_user_id ORDER BY leads DESC, lead.owner_user_id LIMIT ${TOP}`);

  return {
    newLeads: totals?.newLeads ?? 0,
    contacted: totals?.contacted ?? 0,
    newLeadsWon: totals?.newLeadsWon ?? 0,
    medianFirstReplyMinutes: totals?.medianMinutes ?? null,
    quotesSent: moves?.quotesSent ?? 0,
    won: moves?.won ?? 0,
    open: open?.n ?? 0,
    perDay,
    bySource,
    byStage,
    topDestinations: destinations.map((row) => ({ name: names.get(row.destinationId) ?? "", leads: row.leads })),
    responseTimes,
    team,
  };
}
