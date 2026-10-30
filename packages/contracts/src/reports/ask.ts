// Ask your reports in plain words (release ai2b): a question in words is matched to one report of a fixed catalogue and run
// with the asker's own permissions. The AI only picks the report and its range; the figures are always the report's own. An
// answer names its columns by key and kind, and the screen supplies the words, so no sentence travels in the answer.
import { z } from "zod";
import { calendarDate } from "../kernel/index.js";

/** The named ranges a question may use; code turns each into dates in the agency's zone. */
export const askRanges = ["7d", "30d", "90d", "month", "last_month", "quarter", "last_quarter"] as const;
export const askRange = z.enum(askRanges);
export type AskRange = z.infer<typeof askRange>;

/** The reports a question can be answered with (packages/domain/src/reports/queries). */
export const reportQueryIds = [
  "overview",
  "team",
  "leads_by_source",
  "leads_by_destination",
  "leads_by_stage",
  "lost_leads",
  "quotes",
  "payments_collected",
  "payments_due",
  "follow_ups_overdue",
] as const;
export const reportQueryId = z.enum(reportQueryIds);
export type ReportQueryId = z.infer<typeof reportQueryId>;

export const ASK_QUESTION_MAX = 300;
export const askReportInput = z.strictObject({ question: z.string().trim().min(3).max(ASK_QUESTION_MAX) });
export type AskReportInput = z.infer<typeof askReportInput>;

/** A report run again, for another range, without asking the AI. */
export const runReportInput = z.strictObject({ queryId: reportQueryId, range: askRange.optional() });
export type RunReportInput = z.infer<typeof runReportInput>;

/**
 * How a column's cells are shown. `metric`, `source`, `stage`, `lostReason` and `method` hold a key the screen has the words
 * for; `person` holds a user id the api replaces with a name; `text` holds the agency's own words (a destination).
 */
export const reportColumnKinds = [
  "metric",
  "source",
  "stage",
  "lostReason",
  "method",
  "person",
  "text",
  "count",
  "money",
  "minutes",
] as const;
export const reportColumnKind = z.enum(reportColumnKinds);
export type ReportColumnKind = z.infer<typeof reportColumnKind>;

export const reportColumn = z.object({ key: z.string().min(1).max(40), kind: reportColumnKind });
export const reportCell = z.union([z.string(), z.number(), z.null()]);

export const reportAnswer = z.object({
  queryId: reportQueryId,
  /** Null for a report that is about now (overdue follow-ups). */
  range: askRange.nullable(),
  from: calendarDate.nullable(),
  to: calendarDate.nullable(),
  columns: z.array(reportColumn),
  rows: z.array(z.record(z.string(), reportCell)),
});
export type ReportAnswer = z.infer<typeof reportAnswer>;

export const askedReport = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), answer: reportAnswer, usedThisMonth: z.int(), monthlyLimit: z.int() }),
  /** The question is not one the reports answer: the closest three that are. */
  z.object({
    kind: z.literal("declined"),
    suggestions: z.array(reportQueryId).max(3),
    usedThisMonth: z.int(),
    monthlyLimit: z.int(),
  }),
]);
export type AskedReport = z.infer<typeof askedReport>;

/** Which reports the member may ask, and which of them have a range. */
export const askCatalogue = z.array(z.object({ queryId: reportQueryId, ranged: z.boolean() }));

/** What the model answers with, read leniently: the domain checks it against the catalogue the member may use. */
export const askChoice = z.object({
  queryId: z.string().optional(),
  params: z.object({ range: z.string().optional() }).optional(),
  closest: z.array(z.string()).optional(),
});
