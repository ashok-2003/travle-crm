// Reports and analytics (sales execution): over a period, in the agency's zone, how leads turned into bookings and
// money: the funnel, the key figures against the period before, where leads came from and what each source earned, the
// destinations, why leads were lost, the months' trend, when leads arrive, how fast the team replies; the team's
// performance; and one staff member's own figures and what they did. For the member's own leads, or the agency's for a
// role that sees all. Amounts are integer paise, sales before GST.
import { z } from "zod";
import { leadSource, lostReason } from "../crm/fields.js";
import { recordId } from "../identity/fields.js";
import { dashboardRange } from "../insights/dashboard.js";
import { calendarDate } from "../kernel/index.js";

const count = z.int().min(0);
const paise = z.int();

export const reportInput = z.strictObject({ range: dashboardRange });
export type ReportInput = z.infer<typeof reportInput>;
export const staffReportInput = z.strictObject({ range: dashboardRange, userId: recordId });
export type StaffReportInput = z.infer<typeof staffReportInput>;

/** The figures a period is judged by; each also given for the period before, as long. */
export const reportFigures = z.object({
  newLeads: count,
  contacted: count,
  quoted: count,
  bookingRequested: count,
  won: count,
  lost: count,
  /** Sales: quotes accepted in the period, before GST. */
  salesPaise: paise,
  /** Money customers paid in the period. */
  collectedPaise: paise,
  quotesSent: count,
  quotesAccepted: count,
  /** The middle wait for a first reply, in minutes; null when none had one. */
  medianFirstReplyMinutes: z.number().min(0).nullable(),
});
export type ReportFigures = z.infer<typeof reportFigures>;

export const teamRow = z.object({
  userId: recordId,
  /** Null for someone no longer on the staff. */
  name: z.string().nullable(),
  leads: count,
  contacted: count,
  quotesSent: count,
  won: count,
  lost: count,
  salesPaise: paise,
  collectedPaise: paise,
  medianFirstReplyMinutes: z.number().min(0).nullable(),
  /** WhatsApp messages they sent from the CRM in the period. */
  messages: count,
  /** Notes they wrote, follow-ups and tasks they finished, in the period. */
  notes: count,
  tasksDone: count,
  /** Their follow-ups and tasks past their time, now. */
  overdue: count,
  /** Their leads still open, now. */
  openLeads: count,
});
export type TeamRow = z.infer<typeof teamRow>;

export const salesReport = z.object({
  /** False when the member may not see money: every amount is then 0 and the screen shows none. */
  showsMoney: z.boolean(),
  scope: z.enum(["own", "all"]),
  from: calendarDate,
  to: calendarDate,
  figures: reportFigures,
  previous: reportFigures,
  /** Quotes sent and not yet accepted or declined, now: the money in play. */
  pipelinePaise: paise,
  openQuotes: count,
  bySource: z.array(z.object({ source: leadSource, leads: count, won: count, salesPaise: paise })),
  byDestination: z.array(z.object({ name: z.string(), leads: count, won: count, salesPaise: paise })),
  lostReasons: z.array(z.object({ reason: lostReason.nullable(), leads: count })),
  /** Six months to the period's end: new leads, won, sales. */
  months: z.array(z.object({ month: z.string(), leads: count, won: count, salesPaise: paise })),
  /** New leads by the hour they arrived (0-23) in the agency's zone: when someone must be answering. */
  byHour: z.array(z.object({ hour: z.int().min(0).max(23), leads: count })),
  /** New leads by weekday (0 Sunday-6 Saturday). */
  byWeekday: z.array(z.object({ weekday: z.int().min(0).max(6), leads: count })),
  team: z.array(teamRow),
});
export type SalesReport = z.infer<typeof salesReport>;

export const activityEntry = z.object({
  action: z.string(),
  entityType: z.string(),
  entityId: recordId,
  occurredAt: z.iso.datetime(),
});

export const staffReport = z.object({
  /** False when the member may not see money: sales and collections are then 0 and the screen shows none. */
  showsMoney: z.boolean(),
  from: calendarDate,
  to: calendarDate,
  person: teamRow,
  /** The agency's middle figures, to compare against; null for a member who sees only their own leads. */
  teamAverage: z
    .object({
      conversionPercent: z.number().nullable(),
      medianFirstReplyMinutes: z.number().nullable(),
      salesPaise: paise,
    })
    .nullable(),
  /** Each day of the period: messages sent, notes, tasks done, leads won. */
  perDay: z.array(z.object({ day: calendarDate, messages: count, notes: count, tasksDone: count, won: count })),
  /** What they did last, newest first, from the audit log: empty without audit:view. */
  activity: z.array(activityEntry),
  /** When they last did anything; null for never. */
  lastActiveAt: z.iso.datetime().nullable(),
});
export type StaffReport = z.infer<typeof staffReport>;
