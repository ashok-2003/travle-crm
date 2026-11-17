// The periods the Home card, the leads list's "came in" filter and the AI's chat count are asked for.
import { z } from "zod";

/** Today, this week (from Monday), this month (from the 1st) or all time, in the agency's time zone. */
export const periods = ["today", "week", "month", "all"] as const;
export const period = z.enum(periods);
export type Period = z.infer<typeof period>;

/** A period that has a start: all time has none, so a "came in" filter leaves it out. */
export const createdWithin = period.exclude(["all"]);
export type CreatedWithin = z.infer<typeof createdWithin>;
