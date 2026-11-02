// The console's AI usage (the owner, 2026-11-02): every call logged, the month's and today's calls, tokens and cost in
// rupees from the models' published prices, the last 30 days day by day, by feature and by model, each agency's state
// (working, or why not and since when) against its monthly limit, and the calls themselves, a page at a time.
import { z } from "zod";
import { recordId } from "../identity/index.js";
import { calendarDate } from "../kernel/index.js";

export const aiCallOutcome = z.enum(["ok", "rate_limited", "unavailable", "refused", "not_configured"]);
export type AiCallOutcome = z.infer<typeof aiCallOutcome>;

/** A model's published price in US dollars per million tokens, and the next one when a change is announced. */
export const aiModelPrice = z.object({
  model: z.string(),
  inputUsdPerMillion: z.number(),
  outputUsdPerMillion: z.number(),
  changesOn: calendarDate.nullable(),
  nextInputUsdPerMillion: z.number().nullable(),
  nextOutputUsdPerMillion: z.number().nullable(),
});
export type AiModelPrice = z.infer<typeof aiModelPrice>;

/** Calls, the failed among them, tokens, and their cost in paise (0 for a model with no known price). */
export const aiFigures = z.object({
  calls: z.int().min(0),
  failed: z.int().min(0),
  inputTokens: z.number().min(0),
  outputTokens: z.number().min(0),
  costPaise: z.int().min(0),
});
export type AiFigures = z.infer<typeof aiFigures>;

/**
 * Whether an agency's AI works now, or why not: switched off by the agency, not on its plan, its subscription read-only,
 * suspended or cancelled, the month's calls used up, or every model failing (rate limited or down).
 */
export const aiOrganizationState = z.enum([
  "working",
  "off",
  "not_on_plan",
  "subscription_blocked",
  "limit_reached",
  "failing",
  "unused",
]);
export type AiOrganizationState = z.infer<typeof aiOrganizationState>;

export const aiOrganizationUsage = z.object({
  organizationId: recordId,
  name: z.string(),
  code: z.string(),
  state: aiOrganizationState,
  /** For a failing agency, how its last call ended. */
  failingReason: aiCallOutcome.nullable(),
  /** Since when it has been in this state, when known. */
  since: z.iso.datetime().nullable(),
  callsThisMonth: z.int().min(0),
  limit: z.int().min(0),
  thisMonth: aiFigures,
  failedToday: z.int().min(0),
  lastCallAt: z.iso.datetime().nullable(),
  lastOkAt: z.iso.datetime().nullable(),
});
export type AiOrganizationUsage = z.infer<typeof aiOrganizationUsage>;

export const aiOverview = z.object({
  /** Rupees to a US dollar, as the console's settings give it (AI_USD_INR_RATE). */
  usdInrRate: z.number(),
  monthlyCallLimit: z.int(),
  prices: z.array(aiModelPrice),
  today: aiFigures,
  thisMonth: aiFigures.extend({ projectedPaise: z.int().min(0) }),
  /** The last 30 days in India, oldest first. */
  days: z.array(z.object({ day: calendarDate, calls: z.int(), failed: z.int(), costPaise: z.int() })),
  byFeature: z.array(aiFigures.extend({ feature: z.string() })),
  byModel: z.array(aiFigures.extend({ model: z.string(), priced: z.boolean() })),
  organizations: z.array(aiOrganizationUsage),
});
export type AiOverview = z.infer<typeof aiOverview>;

export const listAiCallsInput = z.strictObject({
  organizationId: recordId.optional(),
  failedOnly: z.boolean().default(false),
  limit: z.int().min(1).max(100).default(50),
  /** The page after this call: its time and id, as the last page's nextCursor gave them. */
  before: z.string().max(100).optional(),
});
export type ListAiCallsInput = z.input<typeof listAiCallsInput>;

export const aiCallLine = z.object({
  id: recordId,
  organizationId: recordId,
  organizationName: z.string(),
  occurredAt: z.iso.datetime(),
  feature: z.string(),
  model: z.string(),
  outcome: aiCallOutcome,
  inputTokens: z.int().min(0),
  outputTokens: z.int().min(0),
  durationMs: z.int().min(0),
  /** Null for a model with no known price. */
  costPaise: z.int().min(0).nullable(),
});
export type AiCallLine = z.infer<typeof aiCallLine>;

export const aiCallsPage = z.object({
  calls: z.array(aiCallLine),
  nextCursor: z.string().nullable(),
});
export type AiCallsPage = z.infer<typeof aiCallsPage>;
