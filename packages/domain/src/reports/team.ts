// The team's performance over a period (reports): for each person, the leads they own that arrived in it (contacted,
// won, lost, how fast they first replied), the quotes they sent, their sales and the money collected on their leads,
// the WhatsApp messages, notes and finished tasks they did in it, and, now, their overdue work and open leads. Everyone
// who did anything shows; names are the router's, from identity.
import type { TeamRow } from "@travel-crm/contracts/reports";
import { sql, type OrgTx, type Sql } from "@travel-crm/db";
import { quoteSalesSql } from "../quotes/index.js";
import { overdueByAssignee } from "../tasks/index.js";
import { medianReplySql, repliedSql, type ReportPeriod } from "./figures.js";

type Row = Omit<TeamRow, "name">;

const within = (column: Sql, period: ReportPeriod) =>
  sql`${column} >= ${period.from}::timestamptz AND ${column} < ${period.to}::timestamptz`;

/** Each person's figures; `only` limits it to one person (their own report). */
export async function teamRowsOf(
  tx: OrgTx,
  period: ReportPeriod,
  now: Date,
  only: string | null = null,
): Promise<Row[]> {
  const person = (column: Sql) => (only === null ? sql`${column} IS NOT NULL` : sql`${column} = ${only}::uuid`);
  const leads = await tx.$queryRaw<
    { userId: string; leads: number; contacted: number; won: number; lost: number; median: number | null }[]
  >(sql`
    SELECT lead.owner_user_id AS "userId", count(*)::int AS leads,
      count(*) FILTER (WHERE ${repliedSql})::int AS contacted,
      count(*) FILTER (WHERE lead.stage = 'won')::int AS won,
      count(*) FILTER (WHERE lead.stage = 'lost')::int AS lost,
      ${medianReplySql} AS median
    FROM lead WHERE lead.deleted_at IS NULL AND ${within(sql`lead.created_at`, period)} AND ${person(sql`lead.owner_user_id`)}
    GROUP BY lead.owner_user_id`);
  const quotes = await tx.$queryRaw<{ userId: string; sent: number; sales: bigint }[]>(sql`
    SELECT lead.owner_user_id AS "userId",
      count(*) FILTER (WHERE ${within(sql`q.sent_at`, period)})::int AS sent,
      coalesce(sum(${quoteSalesSql}) FILTER (WHERE q.status = 'accepted' AND ${within(sql`q.accepted_at`, period)}), 0)::bigint AS sales
    FROM quote q JOIN lead ON lead.id = q.lead_id
    WHERE q.deleted_at IS NULL AND lead.deleted_at IS NULL AND ${person(sql`lead.owner_user_id`)}
    GROUP BY lead.owner_user_id`);
  const collected = await tx.$queryRaw<{ userId: string; collected: bigint }[]>(sql`
    SELECT lead.owner_user_id AS "userId", sum(p.amount_paise)::bigint AS collected
    FROM quote_payment p JOIN quote q ON q.id = p.quote_id JOIN lead ON lead.id = q.lead_id
    WHERE p.voided_at IS NULL AND q.deleted_at IS NULL AND lead.deleted_at IS NULL
      AND p.received_on >= ${period.firstDay}::date AND p.received_on <= ${period.lastDay}::date
      AND ${person(sql`lead.owner_user_id`)}
    GROUP BY lead.owner_user_id`);
  const refunded = await tx.$queryRaw<{ userId: string; refunded: bigint }[]>(sql`
    SELECT lead.owner_user_id AS "userId", sum(r.amount_paise)::bigint AS refunded
    FROM booking_refund r JOIN booking b ON b.id = r.booking_id JOIN lead ON lead.id = b.lead_id
    WHERE r.status = 'refunded' AND lead.deleted_at IS NULL
      AND r.refunded_on >= ${period.firstDay}::date AND r.refunded_on <= ${period.lastDay}::date
      AND ${person(sql`lead.owner_user_id`)}
    GROUP BY lead.owner_user_id`);
  const messages = await tx.$queryRaw<{ userId: string; messages: number }[]>(sql`
    SELECT m.sent_by AS "userId", count(*)::int AS messages FROM whatsapp_message m
    WHERE m.direction = 'out' AND m.origin = 'staff_crm' AND ${within(sql`m.occurred_at`, period)}
      AND ${person(sql`m.sent_by`)}
    GROUP BY m.sent_by`);
  const notes = await tx.$queryRaw<{ userId: string; notes: number }[]>(sql`
    SELECT n.created_by AS "userId", count(*)::int AS notes FROM lead_note n
    WHERE ${within(sql`n.created_at`, period)} AND ${person(sql`n.created_by`)} GROUP BY n.created_by`);
  const tasks = await tx.$queryRaw<{ userId: string; done: number }[]>(sql`
    SELECT t.done_by AS "userId", count(*)::int AS done FROM task t
    WHERE t.done_at IS NOT NULL AND ${within(sql`t.done_at`, period)} AND ${person(sql`t.done_by`)} GROUP BY t.done_by`);
  const open = await tx.$queryRaw<{ userId: string; open: number }[]>(sql`
    SELECT lead.owner_user_id AS "userId", count(*)::int AS open FROM lead
    WHERE lead.deleted_at IS NULL AND lead.stage IN ('new', 'contacted', 'quote_sent', 'booking_requested')
      AND ${person(sql`lead.owner_user_id`)}
    GROUP BY lead.owner_user_id`);

  const ids = new Set<string>(only === null ? [] : [only]);
  for (const list of [leads, quotes, collected, refunded, messages, notes, tasks, open])
    for (const row of list) ids.add(row.userId);
  const overdue = await overdueByAssignee(tx, [...ids], now);
  const pick = <T extends { userId: string }>(list: T[], userId: string) => list.find((row) => row.userId === userId);
  return [...ids].map((userId) => {
    const own = pick(leads, userId);
    const quoted = pick(quotes, userId);
    return {
      userId,
      leads: own?.leads ?? 0,
      contacted: own?.contacted ?? 0,
      won: own?.won ?? 0,
      lost: own?.lost ?? 0,
      medianFirstReplyMinutes: own?.median ?? null,
      quotesSent: quoted?.sent ?? 0,
      salesPaise: Number(quoted?.sales ?? 0n),
      collectedPaise: Number(pick(collected, userId)?.collected ?? 0n) - Number(pick(refunded, userId)?.refunded ?? 0n),
      messages: pick(messages, userId)?.messages ?? 0,
      notes: pick(notes, userId)?.notes ?? 0,
      tasksDone: pick(tasks, userId)?.done ?? 0,
      overdue: overdue.get(userId) ?? 0,
      openLeads: pick(open, userId)?.open ?? 0,
    };
  });
}

/** One person's day by day: messages sent, notes, tasks finished, leads won. */
export async function perDayOf(tx: OrgTx, userId: string, period: ReportPeriod, days: readonly string[]) {
  const zone = period.timeZone;
  const daily = (column: Sql) => sql`to_char(${column} AT TIME ZONE ${zone}, 'YYYY-MM-DD')`;
  const messages = await tx.$queryRaw<{ day: string; n: number }[]>(sql`
    SELECT ${daily(sql`m.occurred_at`)} AS day, count(*)::int AS n FROM whatsapp_message m
    WHERE m.direction = 'out' AND m.origin = 'staff_crm' AND m.sent_by = ${userId}::uuid
      AND ${within(sql`m.occurred_at`, period)} GROUP BY 1`);
  const notes = await tx.$queryRaw<{ day: string; n: number }[]>(sql`
    SELECT ${daily(sql`n.created_at`)} AS day, count(*)::int AS n FROM lead_note n
    WHERE n.created_by = ${userId}::uuid AND ${within(sql`n.created_at`, period)} GROUP BY 1`);
  const tasks = await tx.$queryRaw<{ day: string; n: number }[]>(sql`
    SELECT ${daily(sql`t.done_at`)} AS day, count(*)::int AS n FROM task t
    WHERE t.done_by = ${userId}::uuid AND t.done_at IS NOT NULL AND ${within(sql`t.done_at`, period)} GROUP BY 1`);
  const won = await tx.$queryRaw<{ day: string; n: number }[]>(sql`
    SELECT ${daily(sql`lead.stage_changed_at`)} AS day, count(*)::int AS n FROM lead
    WHERE lead.deleted_at IS NULL AND lead.stage = 'won' AND lead.owner_user_id = ${userId}::uuid
      AND ${within(sql`lead.stage_changed_at`, period)} GROUP BY 1`);
  const on = (list: { day: string; n: number }[], day: string) => list.find((row) => row.day === day)?.n ?? 0;
  return days.map((day) => ({
    day,
    messages: on(messages, day),
    notes: on(notes, day),
    tasksDone: on(tasks, day),
    won: on(won, day),
  }));
}
