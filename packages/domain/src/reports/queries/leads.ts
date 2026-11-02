// The catalogue's lead reports: the period's figures, and its new leads by source, destination and stage, and the lost ones by
// reason. They use the reports' own SQL patterns, for the leads the asker sees (the owner filter), live under row-level security.
import { sql } from "@travel-crm/db";
import { destinationNames } from "../../catalog/index.js";
import { quoteSalesSql } from "../../quotes/index.js";
import { cohortOf, figuresOf, ownerOf } from "../figures.js";
import { periodOf } from "../report.js";
import { daysOf } from "../../insights/index.js";
import { addDays, parseCalendarDate } from "../../kernel/index.js";
import type { ReportQuery } from "./types.js";

const salesOfLead = sql`coalesce((SELECT sum(${quoteSalesSql}) FROM quote q
  WHERE q.lead_id = lead.id AND q.deleted_at IS NULL AND q.status = 'accepted'), 0)`;

export const overview: ReportQuery = {
  id: "overview",
  title:
    "The key figures: new leads, contacted, quoted, won, lost, quotes sent and accepted, against the period before",
  ranged: true,
  requires: ["leads:view"],
  async run(tx, _access, { owner, period }) {
    const now = await figuresOf(tx, owner, period);
    const first = parseCalendarDate(period.firstDay);
    const length = daysOf({ first, last: parseCalendarDate(period.lastDay) }).length;
    const before = await figuresOf(tx, owner, periodOf(addDays(first, -length), addDays(first, -1), period.timeZone));
    const metrics = [
      "newLeads",
      "contacted",
      "quoted",
      "bookingRequested",
      "won",
      "lost",
      "quotesSent",
      "quotesAccepted",
    ] as const;
    return {
      columns: [
        { key: "metric", kind: "metric" },
        { key: "now", kind: "count" },
        { key: "before", kind: "count" },
      ],
      rows: metrics.map((metric) => ({ metric, now: now[metric], before: before[metric] })),
    };
  },
};

export const leadsBySource: ReportQuery = {
  id: "leads_by_source",
  title: "New leads by where they came from (Instagram, website, referral...), with how many were won",
  ranged: true,
  requires: ["leads:view"],
  async run(tx, _access, { owner, period, showsMoney }) {
    const rows = await tx.$queryRaw<{ source: string; leads: number; won: number; sales: bigint }[]>(sql`
      SELECT lead.source, count(*)::int AS leads, count(*) FILTER (WHERE lead.stage = 'won')::int AS won,
        sum(${salesOfLead})::bigint AS sales
      FROM lead WHERE ${cohortOf(owner, period)} GROUP BY lead.source ORDER BY leads DESC`);
    return {
      columns: [
        { key: "source", kind: "source" },
        { key: "leads", kind: "count" },
        { key: "won", kind: "count" },
        ...(showsMoney ? [{ key: "sales", kind: "money" as const }] : []),
      ],
      rows: rows.map((row) => ({
        source: row.source,
        leads: row.leads,
        won: row.won,
        ...(showsMoney ? { sales: Number(row.sales) } : {}),
      })),
    };
  },
};

export const leadsByDestination: ReportQuery = {
  id: "leads_by_destination",
  title: "New leads by destination, the ten asked for most, with how many were won",
  ranged: true,
  requires: ["leads:view"],
  async run(tx, _access, { owner, period, showsMoney }) {
    const rows = await tx.$queryRaw<{ destinationId: string; leads: number; won: number; sales: bigint }[]>(sql`
      SELECT lead.destination_id AS "destinationId", count(*)::int AS leads,
        count(*) FILTER (WHERE lead.stage = 'won')::int AS won, sum(${salesOfLead})::bigint AS sales
      FROM lead WHERE ${cohortOf(owner, period)} AND lead.destination_id IS NOT NULL
      GROUP BY lead.destination_id ORDER BY leads DESC LIMIT 10`);
    const names = await destinationNames(
      tx,
      rows.map((row) => row.destinationId),
    );
    return {
      columns: [
        { key: "destination", kind: "text" },
        { key: "leads", kind: "count" },
        { key: "won", kind: "count" },
        ...(showsMoney ? [{ key: "sales", kind: "money" as const }] : []),
      ],
      rows: rows.map((row) => ({
        destination: names.get(row.destinationId) ?? "",
        leads: row.leads,
        won: row.won,
        ...(showsMoney ? { sales: Number(row.sales) } : {}),
      })),
    };
  },
};

export const leadsByStage: ReportQuery = {
  id: "leads_by_stage",
  title: "The period's new leads by the stage they have reached now (new, contacted, quote sent, won, lost...)",
  ranged: true,
  requires: ["leads:view"],
  async run(tx, _access, { owner, period }) {
    const rows = await tx.$queryRaw<{ stage: string; leads: number }[]>(sql`
      SELECT lead.stage, count(*)::int AS leads FROM lead WHERE ${cohortOf(owner, period)}
      GROUP BY lead.stage ORDER BY leads DESC`);
    return {
      columns: [
        { key: "stage", kind: "stage" },
        { key: "leads", kind: "count" },
      ],
      rows: rows.map((row) => ({ stage: row.stage, leads: row.leads })),
    };
  },
};

export const lostLeads: ReportQuery = {
  id: "lost_leads",
  title: "Leads lost in the period, by the reason given (price, dates, competitor, no reply...)",
  ranged: true,
  requires: ["leads:view"],
  async run(tx, _access, { owner, period }) {
    const rows = await tx.$queryRaw<{ reason: string | null; leads: number }[]>(sql`
      SELECT lead.lost_reason AS reason, count(*)::int AS leads FROM lead
      WHERE lead.deleted_at IS NULL AND lead.stage = 'lost' ${ownerOf(owner)}
        AND lead.stage_changed_at >= ${period.from}::timestamptz AND lead.stage_changed_at < ${period.to}::timestamptz
      GROUP BY lead.lost_reason ORDER BY leads DESC`);
    return {
      columns: [
        { key: "reason", kind: "lostReason" },
        { key: "leads", kind: "count" },
      ],
      rows: rows.map((row) => ({ reason: row.reason ?? "other", leads: row.leads })),
    };
  },
};
