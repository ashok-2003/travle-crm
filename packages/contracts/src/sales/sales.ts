// Sales execution (the owner's focus of 2026-10-27): what makes a lead hot, and the hot leads to call now.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";

export const leadIdOnlyInput = z.strictObject({ leadId: recordId });

/** Why a lead is hot, strongest first. */
export const hotReasons = ["quote_opened", "asked_price"] as const;
export const hotReason = z.enum(hotReasons);
export type HotReason = z.infer<typeof hotReason>;

export const hotLead = z.object({
  leadId: recordId,
  name: z.string(),
  phone: z.string().nullable(),
  stage: z.string(),
  ownerUserId: recordId.nullable(),
  destination: z.string().nullable(),
  startDate: calendarDate.nullable(),
  /** Higher is hotter. */
  score: z.int(),
  reasons: z.array(hotReason),
  /** The last time the customer did something that made it hot. */
  lastSignalAt: z.iso.datetime().nullable(),
});
export type HotLead = z.infer<typeof hotLead>;
export const hotLeadList = z.array(hotLead);
