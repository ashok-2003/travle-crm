// A period's key figures (reports): of the leads that arrived in it, how many were contacted, quoted, asked to book, won
// and lost, and how fast they first heard back; the quotes sent in it and those accepted in it (one may be accepted
// without being sent, marked by hand or paid), the sales (accepted, before GST) and the money customers paid. For one owner's leads, or the agency's. Live sums under row-level security.
import type { ReportFigures } from "@travel-crm/contracts/reports";
import { emptySql, sql, type OrgTx, type Sql } from "@travel-crm/db";

export interface ReportPeriod {
  /** The first instant of the first day, and the first instant after the last, in the agency's zone. */
  from: Date;
  to: Date;
  /** The same days as calendar dates, for the payments' received_on. */
  firstDay: string;
  lastDay: string;
  timeZone: string;
}

export const ownerOf = (ownerUserId: string | null): Sql =>
  ownerUserId === null ? emptySql : sql`AND lead.owner_user_id = ${ownerUserId}::uuid`;

export const cohortOf = (ownerUserId: string | null, period: ReportPeriod): Sql =>
  sql`lead.deleted_at IS NULL AND lead.created_at >= ${period.from}::timestamptz
    AND lead.created_at < ${period.to}::timestamptz ${ownerOf(ownerUserId)}`;

/** A lead that was quoted: a quote went out, or it reached Quote sent or past it. */
export const quotedSql = sql`(lead.stage IN ('quote_sent', 'booking_requested', 'won') OR EXISTS (
  SELECT 1 FROM quote q WHERE q.lead_id = lead.id AND q.deleted_at IS NULL AND q.status <> 'draft'))`;
/** A lead that asked to book: a quote was accepted, or it reached Booking requested or Won. */
export const bookedSql = sql`(lead.stage IN ('booking_requested', 'won') OR EXISTS (
  SELECT 1 FROM quote q WHERE q.lead_id = lead.id AND q.deleted_at IS NULL AND q.status = 'accepted'))`;
export const repliedSql = sql`(lead.first_reply_at IS NOT NULL OR lead.stage NOT IN ('new', 'not_a_lead'))`;
export const medianReplySql = sql`(percentile_cont(0.5) WITHIN GROUP (
  ORDER BY extract(epoch FROM lead.first_reply_at - lead.created_at) / 60)
  FILTER (WHERE lead.first_reply_at IS NOT NULL))::float8`;

export async function figuresOf(tx: OrgTx, ownerUserId: string | null, period: ReportPeriod): Promise<ReportFigures> {
  const [leads] = await tx.$queryRaw<
    {
      newLeads: number;
      contacted: number;
      quoted: number;
      bookingRequested: number;
      won: number;
      lost: number;
      median: number | null;
    }[]
  >(sql`
    SELECT count(*)::int AS "newLeads",
      count(*) FILTER (WHERE ${repliedSql})::int AS contacted,
      count(*) FILTER (WHERE ${quotedSql})::int AS quoted,
      count(*) FILTER (WHERE ${bookedSql})::int AS "bookingRequested",
      count(*) FILTER (WHERE lead.stage = 'won')::int AS won,
      count(*) FILTER (WHERE lead.stage = 'lost')::int AS lost,
      ${medianReplySql} AS median
    FROM lead WHERE ${cohortOf(ownerUserId, period)}`);
  const owner = ownerOf(ownerUserId);
  const [quotes] = await tx.$queryRaw<{ sales: bigint; sent: number; accepted: number }[]>(sql`
    SELECT
      coalesce(sum(q.subtotal_paise) FILTER (WHERE q.status = 'accepted'
        AND q.accepted_at >= ${period.from}::timestamptz AND q.accepted_at < ${period.to}::timestamptz), 0)::bigint AS sales,
      count(*) FILTER (WHERE q.sent_at >= ${period.from}::timestamptz AND q.sent_at < ${period.to}::timestamptz)::int AS sent,
      count(*) FILTER (WHERE q.status = 'accepted'
        AND q.accepted_at >= ${period.from}::timestamptz AND q.accepted_at < ${period.to}::timestamptz)::int AS accepted
    FROM quote q JOIN lead ON lead.id = q.lead_id
    WHERE q.deleted_at IS NULL ${owner}`);
  const [paid] = await tx.$queryRaw<{ collected: bigint }[]>(sql`
    SELECT coalesce(sum(p.amount_paise), 0)::bigint AS collected
    FROM quote_payment p JOIN quote q ON q.id = p.quote_id JOIN lead ON lead.id = q.lead_id
    WHERE p.voided_at IS NULL AND p.received_on >= ${period.firstDay}::date AND p.received_on <= ${period.lastDay}::date
      ${owner}`);
  return {
    newLeads: leads?.newLeads ?? 0,
    contacted: leads?.contacted ?? 0,
    quoted: leads?.quoted ?? 0,
    bookingRequested: leads?.bookingRequested ?? 0,
    won: leads?.won ?? 0,
    lost: leads?.lost ?? 0,
    medianFirstReplyMinutes: leads?.median ?? null,
    salesPaise: Number(quotes?.sales ?? 0n),
    collectedPaise: Number(paid?.collected ?? 0n),
    quotesSent: quotes?.sent ?? 0,
    quotesAccepted: quotes?.accepted ?? 0,
  };
}
