// Each person's morning summary push (release 5, spec 3.3): on or off, and the time in the agency's zone, in quarters
// of an hour. A person who never chose has it on at 09:00.
import { z } from "zod";

export const DEFAULT_MORNING_TIME = "09:00";

/** HH:MM on a quarter of an hour: the worker looks at the morning every 15 minutes. */
export const morningTime = z.string().regex(/^([01][0-9]|2[0-3]):(00|15|30|45)$/, "Use a time on the quarter hour");

export const morningSetting = z.object({ enabled: z.boolean(), time: morningTime });
export type MorningSetting = z.infer<typeof morningSetting>;

export const morningSettingInput = z.strictObject({ enabled: z.boolean(), time: morningTime });
export type MorningSettingInput = z.infer<typeof morningSettingInput>;

/** The notification kind of the morning summary. */
export const MORNING_PUSH_KIND = "today.morning";
