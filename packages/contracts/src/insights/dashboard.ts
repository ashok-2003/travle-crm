// The dashboard (release B): how the agency's leads did over a period, for the person's own leads or, for a role that
// sees everyone's, the whole agency. Counts and medians only; never a customer's details.
import { z } from "zod";
import { leadSource, leadStage } from "../crm/index.js";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";

/** The periods the dashboard offers: the last 7, 30 or 90 days, or this calendar month so far, in the agency's zone. */
export const dashboardRanges = ["7d", "30d", "90d", "month"] as const;
export const dashboardRange = z.enum(dashboardRanges);
export type DashboardRange = z.infer<typeof dashboardRange>;

export const dashboardInput = z.strictObject({ range: dashboardRange });
export type DashboardInput = z.infer<typeof dashboardInput>;

/** How long new leads waited for their first reply (leaving New), in buckets; "waiting" have none yet. */
export const responseBuckets = ["under15m", "under1h", "under4h", "under1d", "later", "waiting"] as const;
export const responseBucket = z.enum(responseBuckets);
export type ResponseBucket = z.infer<typeof responseBucket>;

const count = z.int().min(0);

export const dashboard = z.object({
  /** Whose leads: the person's own, or everyone's. */
  scope: z.enum(["own", "all"]),
  /** The period's first and last days, in the agency's zone. */
  from: calendarDate,
  to: calendarDate,
  totals: z.object({
    /** Leads that came in during the period. */
    newLeads: count,
    /** Of those, the ones that have had a reply (left New). */
    contacted: count,
    /** The middle wait for a first reply among those, in minutes; null when none has had one. */
    medianFirstReplyMinutes: z.number().min(0).nullable(),
    /** Leads moved to Quote sent during the period. */
    quotesSent: count,
    /** Leads moved to Won during the period. */
    won: count,
    /** Of the period's new leads, the ones Won by now. */
    newLeadsWon: count,
    /** Leads in an open stage now. */
    open: count,
    /** Follow-ups and tasks past their time now. */
    overdue: count,
  }),
  /** New leads per day, every day of the period. */
  perDay: z.array(z.object({ day: calendarDate, leads: count })),
  /** New leads by their first source, and how many of them are Won, most leads first. */
  bySource: z.array(z.object({ source: leadSource, leads: count, won: count })),
  /** The period's new leads by the stage they are in now, in the stages' order. */
  byStage: z.array(z.object({ stage: leadStage, leads: count })),
  /** The ten destinations most of the period's new leads asked for. */
  topDestinations: z.array(z.object({ name: z.string(), leads: count })),
  /** The period's new leads by how long they waited for a first reply. */
  responseTimes: z.array(z.object({ bucket: responseBucket, leads: count })),
  /** Everyone's share, for a role that sees all leads (empty otherwise): the ten with the most new leads. */
  team: z.array(
    // The name is null for someone no longer on the staff.
    z.object({ userId: recordId, name: z.string().nullable(), leads: count, contacted: count, won: count }),
  ),
});
export type Dashboard = z.infer<typeof dashboard>;
