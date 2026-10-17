// Today (spec 3.5): the signed-in person's overdue and due-today follow-ups and tasks, and their new leads waiting for
// a reply, counted for the day in the agency's zone and listed a section at a time.
import { z } from "zod";
import { leadSource } from "../crm/fields.js";
import { tripSummary } from "../crm/trip.js";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { task } from "../tasks/tasks.js";

export const todaySectionNames = ["overdue", "new-leads", "due-today"] as const;
export const todaySectionName = z.enum(todaySectionNames);
export type TodaySectionName = z.infer<typeof todaySectionName>;

/** A lead in brief, beside its task or as a new lead waiting. */
export const leadBrief = z.object({
  id: recordId,
  personName: z.string(),
  phone: z.string().nullable(),
  trip: tripSummary,
  source: leadSource,
});
export type LeadBrief = z.infer<typeof leadBrief>;

export const todayItem = z.discriminatedUnion("kind", [
  /** A follow-up or task, with its lead when it is on one. */
  z.object({ kind: z.literal("task"), task, lead: leadBrief.nullable() }),
  /** A lead still in New: since when it has waited. */
  z.object({ kind: z.literal("new-lead"), lead: leadBrief, waitingSince: z.iso.datetime() }),
]);
export type TodayItem = z.infer<typeof todayItem>;

export const todaySummary = z.object({
  /** Today in the agency's zone. */
  day: calendarDate,
  counts: z.object({ overdue: z.int(), newLeads: z.int(), dueToday: z.int() }),
  /** The first overdue, the oldest new lead and the next due today, as far as there are any. */
  top: z.array(todayItem).max(3),
});
export type TodaySummary = z.infer<typeof todaySummary>;

export const todaySectionInput = z.strictObject({
  section: todaySectionName,
  /** The last item's id (a task's or a lead's) of the previous page. */
  after: recordId.optional(),
  limit: z.int().min(1).max(50).default(20),
});
export type TodaySectionInput = z.infer<typeof todaySectionInput>;

export const todaySectionPage = z.object({ items: z.array(todayItem), nextCursor: recordId.nullable() });
export type TodaySectionPage = z.infer<typeof todaySectionPage>;
