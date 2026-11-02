// The catalogue's quote and money reports: quotes sent and accepted, the payments collected by method, and what is still to be
// paid. The money ones need money:view_reports; without it a report shows its counts only, or is not offered at all.
import { sql } from "@travel-crm/db";
import { calendarDateIn } from "../../kernel/index.js";
import { quoteSalesSql } from "../../quotes/index.js";
import { moneySummaryOf } from "../../quotes/index.js";
import { ownerOf } from "../figures.js";
import type { ReportQuery } from "./types.js";

export const quotes: ReportQuery = {
  id: "quotes",
  title: "Quotes sent and accepted in the period, and the quotes still waiting for an answer now",
  ranged: true,
  requires: ["leads:view"],
  async run(tx, _access, { owner, period, showsMoney }) {
    const [row] = await tx.$queryRaw<
      { sent: number; accepted: number; sales: bigint; open: number; pipeline: bigint }[]
    >(sql`
      SELECT count(*) FILTER (WHERE q.sent_at >= ${period.from}::timestamptz AND q.sent_at < ${period.to}::timestamptz)::int AS sent,
        count(*) FILTER (WHERE q.status = 'accepted' AND q.accepted_at >= ${period.from}::timestamptz
          AND q.accepted_at < ${period.to}::timestamptz)::int AS accepted,
        coalesce(sum(${quoteSalesSql}) FILTER (WHERE q.status = 'accepted' AND q.accepted_at >= ${period.from}::timestamptz
          AND q.accepted_at < ${period.to}::timestamptz), 0)::bigint AS sales,
        count(*) FILTER (WHERE q.status = 'sent' AND lead.stage IN ('new', 'contacted', 'quote_sent', 'booking_requested'))::int AS open,
        coalesce(sum(q.total_paise) FILTER (WHERE q.status = 'sent'
          AND lead.stage IN ('new', 'contacted', 'quote_sent', 'booking_requested')), 0)::bigint AS pipeline
      FROM quote q JOIN lead ON lead.id = q.lead_id
      WHERE q.deleted_at IS NULL AND lead.deleted_at IS NULL ${ownerOf(owner)}`);
    return {
      columns: [
        { key: "metric", kind: "metric" },
        { key: "count", kind: "count" },
        ...(showsMoney ? [{ key: "amount", kind: "money" as const }] : []),
      ],
      rows: [
        { metric: "quotesSent", count: row?.sent ?? 0, ...(showsMoney ? { amount: null } : {}) },
        {
          metric: "quotesAccepted",
          count: row?.accepted ?? 0,
          ...(showsMoney ? { amount: Number(row?.sales ?? 0n) } : {}),
        },
        {
          metric: "quotesOpen",
          count: row?.open ?? 0,
          ...(showsMoney ? { amount: Number(row?.pipeline ?? 0n) } : {}),
        },
      ],
    };
  },
};

export const paymentsCollected: ReportQuery = {
  id: "payments_collected",
  title: "Money customers paid in the period, by how they paid (UPI, bank, cash, card), less refunds",
  ranged: true,
  requires: ["leads:view", "money:view_reports"],
  async run(tx, _access, { owner, period }) {
    const paid = await tx.$queryRaw<{ method: string; payments: number; total: bigint }[]>(sql`
      SELECT p.method, count(*)::int AS payments, sum(p.amount_paise)::bigint AS total
      FROM quote_payment p JOIN quote q ON q.id = p.quote_id JOIN lead ON lead.id = q.lead_id
      WHERE p.voided_at IS NULL AND q.deleted_at IS NULL AND lead.deleted_at IS NULL
        AND p.received_on >= ${period.firstDay}::date AND p.received_on <= ${period.lastDay}::date ${ownerOf(owner)}
      GROUP BY p.method ORDER BY total DESC`);
    const [refunded] = await tx.$queryRaw<{ refunds: number; total: bigint }[]>(sql`
      SELECT count(*)::int AS refunds, coalesce(sum(r.amount_paise), 0)::bigint AS total
      FROM booking_refund r JOIN booking b ON b.id = r.booking_id JOIN lead ON lead.id = b.lead_id
      WHERE r.status = 'refunded' AND lead.deleted_at IS NULL
        AND r.refunded_on >= ${period.firstDay}::date AND r.refunded_on <= ${period.lastDay}::date ${ownerOf(owner)}`);
    return {
      columns: [
        { key: "method", kind: "method" },
        { key: "payments", kind: "count" },
        { key: "amount", kind: "money" },
      ],
      rows: [
        ...paid.map((row) => ({ method: row.method, payments: row.payments, amount: Number(row.total) })),
        ...((refunded?.refunds ?? 0) > 0
          ? [{ method: "refunds", payments: refunded?.refunds ?? 0, amount: -Number(refunded?.total ?? 0n) }]
          : []),
      ],
    };
  },
};

export const paymentsDue: ReportQuery = {
  id: "payments_due",
  title: "Money still to be paid on accepted quotes now, and how much of it is overdue",
  ranged: false,
  requires: ["quotes:view", "money:view_reports"],
  async run(tx, access, { now, period }) {
    const today = calendarDateIn(now, period.timeZone);
    const summary = await moneySummaryOf(tx, access, { from: today, to: today, today, timeZone: period.timeZone });
    return {
      columns: [
        { key: "metric", kind: "metric" },
        { key: "count", kind: "count" },
        { key: "amount", kind: "money" },
      ],
      rows: [
        { metric: "outstanding", count: null, amount: summary.outstandingPaise },
        { metric: "overdue", count: summary.overdueCount, amount: summary.overduePaise },
      ],
    };
  },
};
