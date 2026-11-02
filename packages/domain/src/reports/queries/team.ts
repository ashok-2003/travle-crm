// The catalogue's reports about people: each person's figures for the period, and who has follow-ups past their time. Names
// are the router's, from identity: a `person` cell holds the user id.
import { sql } from "@travel-crm/db";
import { teamRowsOf } from "../team.js";
import type { ReportQuery } from "./types.js";

export const team: ReportQuery = {
  id: "team",
  title: "Each team member's leads, quotes sent, bookings won and lost, first-reply time and sales in the period",
  ranged: true,
  requires: ["leads:view"],
  allOnly: true,
  async run(tx, _access, { now, period, showsMoney }) {
    const rows = await teamRowsOf(tx, period, now);
    return {
      columns: [
        { key: "person", kind: "person" },
        { key: "leads", kind: "count" },
        { key: "quotesSent", kind: "count" },
        { key: "won", kind: "count" },
        { key: "lost", kind: "count" },
        { key: "firstReply", kind: "minutes" },
        ...(showsMoney ? [{ key: "sales", kind: "money" as const }] : []),
      ],
      rows: [...rows]
        .sort((a, b) => b.won - a.won || b.leads - a.leads)
        .map((row) => ({
          person: row.userId,
          leads: row.leads,
          quotesSent: row.quotesSent,
          won: row.won,
          lost: row.lost,
          firstReply: row.medianFirstReplyMinutes,
          ...(showsMoney ? { sales: row.salesPaise } : {}),
        })),
    };
  },
};

export const followUpsOverdue: ReportQuery = {
  id: "follow_ups_overdue",
  title: "Follow-ups and tasks past their time now, per person",
  ranged: false,
  requires: ["leads:view"],
  async run(tx, _access, { now, owner }) {
    const rows = await tx.$queryRaw<{ userId: string; overdue: number }[]>(sql`
      SELECT task.assignee_user_id AS "userId", count(*)::int AS overdue FROM task
      WHERE task.done_at IS NULL AND task.cancelled_at IS NULL AND task.due_at < ${now}::timestamptz
        AND task.assignee_user_id IS NOT NULL
        ${owner === null ? sql`` : sql`AND task.assignee_user_id = ${owner}::uuid`}
      GROUP BY task.assignee_user_id ORDER BY overdue DESC`);
    return {
      columns: [
        { key: "person", kind: "person" },
        { key: "overdue", kind: "count" },
      ],
      rows: rows.map((row) => ({ person: row.userId, overdue: row.overdue })),
    };
  },
};
