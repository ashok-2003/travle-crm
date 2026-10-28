// How organizations use the product, for the platform console (the owner, 2026-10-28): each organization's members,
// leads, when it was last used and for how long, its sessions, its pages, and what its AI costs so far this month and
// at this pace by the month's end. Times in seconds; money in paise.
import { z } from "zod";
import { recordId } from "../identity/index.js";

export const organizationUsageRow = z.object({
  organizationId: recordId,
  name: z.string(),
  code: z.string(),
  createdAt: z.iso.datetime(),
  vip: z.boolean(),
  members: z.int(),
  leads: z.int(),
  lastActiveAt: z.iso.datetime().nullable(),
  /** Seconds in the product over the last 7 and 30 days, everyone together. */
  seconds7d: z.int(),
  seconds30d: z.int(),
  sessions30d: z.int(),
  aiCostPaise: z.int(),
  aiProjectedPaise: z.int(),
});
export type OrganizationUsageRow = z.infer<typeof organizationUsageRow>;

export const usageOverview = z.object({
  items: z.array(organizationUsageRow),
  totals: z.object({
    organizations: z.int(),
    activeToday: z.int(),
    active7d: z.int(),
    seconds7d: z.int(),
    aiCostPaise: z.int(),
    aiProjectedPaise: z.int(),
  }),
  /** Whether AI prices are set (AI_PRICE_*): without them every cost is 0. */
  aiPriced: z.boolean(),
});
export type UsageOverview = z.infer<typeof usageOverview>;

export const organizationUsage = z.object({
  pages: z.array(z.object({ path: z.string(), visits: z.int(), seconds: z.int() })),
  members: z.array(
    z.object({
      userId: recordId,
      name: z.string(),
      lastActiveAt: z.iso.datetime().nullable(),
      seconds30d: z.int(),
      sessions30d: z.int(),
    }),
  ),
  /** The last 14 days, oldest first: people active and seconds used each day (UTC days). */
  days: z.array(z.object({ day: z.string(), people: z.int(), seconds: z.int() })),
  /** Sign-ins: each session's start, newest first. */
  sessions: z.array(z.object({ userId: recordId, name: z.string(), startedAt: z.iso.datetime(), seconds: z.int() })),
  ai: z.object({
    calls: z.int(),
    inputTokens: z.int(),
    outputTokens: z.int(),
    costPaise: z.int(),
    projectedPaise: z.int(),
  }),
});
export type OrganizationUsage = z.infer<typeof organizationUsage>;

export const organizationUsageInput = z.strictObject({ organizationId: recordId });
