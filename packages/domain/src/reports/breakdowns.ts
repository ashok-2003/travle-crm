// A period's breakdowns (reports): its new leads by source and destination with what each won and earned, why leads
// were lost in it, six months of leads, wins and sales, when leads arrive (hour and weekday, in the agency's zone), and
// the quotes still in play now.
import { leadSources, lostReasons, type LeadSource, type LostReason } from "@travel-crm/contracts/crm";
import type { SalesReport } from "@travel-crm/contracts/reports";
import { sql, type OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import { cohortOf, ownerOf, type ReportPeriod } from "./figures.js";

const TOP = 10;

/** What the accepted quotes of each lead earned, before GST. */
const salesOfLead = sql`coalesce((SELECT sum(q.subtotal_paise) FROM quote q
  WHERE q.lead_id = lead.id AND q.deleted_at IS NULL AND q.status = 'accepted'), 0)`;

export async function breakdownsOf(
  tx: OrgTx,
  ownerUserId: string | null,
  period: ReportPeriod,
): Promise<Omit<SalesReport, "showsMoney" | "scope" | "from" | "to" | "figures" | "previous" | "team">> {
  const cohort = cohortOf(ownerUserId, period);
  const owner = ownerOf(ownerUserId);
  const zone = period.timeZone;

  const sources = await tx.$queryRaw<{ source: string; leads: number; won: number; sales: bigint }[]>(sql`
    SELECT lead.source, count(*)::int AS leads, count(*) FILTER (WHERE lead.stage = 'won')::int AS won,
      sum(${salesOfLead})::bigint AS sales
    FROM lead WHERE ${cohort} GROUP BY lead.source ORDER BY leads DESC`);
  const destinations = await tx.$queryRaw<{ destinationId: string; leads: number; won: number; sales: bigint }[]>(sql`
    SELECT lead.destination_id AS "destinationId", count(*)::int AS leads,
      count(*) FILTER (WHERE lead.stage = 'won')::int AS won, sum(${salesOfLead})::bigint AS sales
    FROM lead WHERE ${cohort} AND lead.destination_id IS NOT NULL
    GROUP BY lead.destination_id ORDER BY leads DESC LIMIT ${TOP}`);
  const names = await destinationNames(
    tx,
    destinations.map((row) => row.destinationId),
  );
  const lost = await tx.$queryRaw<{ reason: string | null; leads: number }[]>(sql`
    SELECT lead.lost_reason AS reason, count(*)::int AS leads FROM lead
    WHERE lead.deleted_at IS NULL AND lead.stage = 'lost' ${owner}
      AND lead.stage_changed_at >= ${period.from}::timestamptz AND lead.stage_changed_at < ${period.to}::timestamptz
    GROUP BY lead.lost_reason ORDER BY leads DESC`);

  // Six calendar months to the period's end, in the agency's zone.
  const monthStart = sql`date_trunc('month', (${period.to}::timestamptz - interval '1 second') AT TIME ZONE ${zone})
    - interval '5 months'`;
  const leadMonths = await tx.$queryRaw<{ month: string; leads: number }[]>(sql`
    SELECT to_char(lead.created_at AT TIME ZONE ${zone}, 'YYYY-MM') AS month, count(*)::int AS leads FROM lead
    WHERE lead.deleted_at IS NULL ${owner} AND lead.created_at AT TIME ZONE ${zone} >= ${monthStart}
      AND lead.created_at < ${period.to}::timestamptz
    GROUP BY 1`);
  const wonMonths = await tx.$queryRaw<{ month: string; won: number }[]>(sql`
    SELECT to_char(lead.stage_changed_at AT TIME ZONE ${zone}, 'YYYY-MM') AS month, count(*)::int AS won FROM lead
    WHERE lead.deleted_at IS NULL AND lead.stage = 'won' ${owner}
      AND lead.stage_changed_at AT TIME ZONE ${zone} >= ${monthStart} AND lead.stage_changed_at < ${period.to}::timestamptz
    GROUP BY 1`);
  const salesMonths = await tx.$queryRaw<{ month: string; sales: bigint }[]>(sql`
    SELECT to_char(q.accepted_at AT TIME ZONE ${zone}, 'YYYY-MM') AS month, sum(q.subtotal_paise)::bigint AS sales
    FROM quote q JOIN lead ON lead.id = q.lead_id
    WHERE q.deleted_at IS NULL AND lead.deleted_at IS NULL AND q.status = 'accepted' ${owner}
      AND q.accepted_at AT TIME ZONE ${zone} >= ${monthStart} AND q.accepted_at < ${period.to}::timestamptz
    GROUP BY 1`);
  const [last] = await tx.$queryRaw<{ month: string }[]>(sql`
    SELECT to_char((${period.to}::timestamptz - interval '1 second') AT TIME ZONE ${zone}, 'YYYY-MM') AS month`);
  const months = sixMonthsTo(last?.month ?? period.lastDay.slice(0, 7));

  const hours = await tx.$queryRaw<{ hour: number; leads: number }[]>(sql`
    SELECT extract(hour FROM lead.created_at AT TIME ZONE ${zone})::int AS hour, count(*)::int AS leads
    FROM lead WHERE ${cohort} GROUP BY 1`);
  const weekdays = await tx.$queryRaw<{ weekday: number; leads: number }[]>(sql`
    SELECT extract(dow FROM lead.created_at AT TIME ZONE ${zone})::int AS weekday, count(*)::int AS leads
    FROM lead WHERE ${cohort} GROUP BY 1`);
  const [pipeline] = await tx.$queryRaw<{ total: bigint; quotes: number }[]>(sql`
    SELECT coalesce(sum(q.total_paise), 0)::bigint AS total, count(*)::int AS quotes
    FROM quote q JOIN lead ON lead.id = q.lead_id
    WHERE q.deleted_at IS NULL AND lead.deleted_at IS NULL AND q.status = 'sent' AND lead.stage IN ('new', 'contacted', 'quote_sent', 'booking_requested')
      ${owner}`);

  const isSource = (value: string): value is LeadSource => (leadSources as readonly string[]).includes(value);
  const isReason = (value: string | null): value is LostReason | null =>
    value === null || (lostReasons as readonly string[]).includes(value);
  return {
    pipelinePaise: Number(pipeline?.total ?? 0n),
    openQuotes: pipeline?.quotes ?? 0,
    bySource: sources.flatMap((row) =>
      isSource(row.source)
        ? [{ source: row.source, leads: row.leads, won: row.won, salesPaise: Number(row.sales) }]
        : [],
    ),
    byDestination: destinations.map((row) => ({
      name: names.get(row.destinationId) ?? "",
      leads: row.leads,
      won: row.won,
      salesPaise: Number(row.sales),
    })),
    lostReasons: lost.flatMap((row) => (isReason(row.reason) ? [{ reason: row.reason, leads: row.leads }] : [])),
    months: months.map((month) => ({
      month,
      leads: leadMonths.find((row) => row.month === month)?.leads ?? 0,
      won: wonMonths.find((row) => row.month === month)?.won ?? 0,
      salesPaise: Number(salesMonths.find((row) => row.month === month)?.sales ?? 0n),
    })),
    byHour: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      leads: hours.find((row) => row.hour === hour)?.leads ?? 0,
    })),
    byWeekday: Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      leads: weekdays.find((row) => row.weekday === weekday)?.leads ?? 0,
    })),
  };
}

/** The six months to `last` (YYYY-MM), oldest first. */
function sixMonthsTo(last: string): string[] {
  const [year = 2026, month = 1] = last.split("-").map(Number);
  return Array.from({ length: 6 }, (_, index) =>
    new Date(Date.UTC(year, month - 1 - (5 - index), 1)).toISOString().slice(0, 7),
  );
}
