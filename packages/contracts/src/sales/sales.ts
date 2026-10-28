// Sales execution (the owner's focus of 2026-10-27): the agency's automation (the first WhatsApp to a new lead within a
// minute, follow-ups when a lead goes quiet, payment reminders, what makes a lead hot), a lead's follow-up run, and the
// hot leads to call now.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/index.js";

/**
 * What fills a template's blank, filled for each lead when it is sent: the customer's first name, where they want to go,
 * when, their salesperson's name, the agency's name; for a payment reminder also the amount, the day it is due and the
 * quote's link. "text:<words>" is the same words for everyone.
 */
export const templateFields = ["name", "destination", "when", "agent", "agency", "amount", "due", "link"] as const;
export type TemplateField = (typeof templateFields)[number];
export const templateParam = z
  .string()
  .trim()
  .max(200)
  .refine(
    (value) => (templateFields as readonly string[]).includes(value) || (value.startsWith("text:") && value.length > 5),
    "Choose what fills the blank",
  );

export const MAX_FOLLOW_STEPS = 5;

export const followStep = z.strictObject({
  /** Days after the lead arrived. */
  days: z.int().min(1).max(60),
  templateId: recordId,
  params: z.array(templateParam).max(10),
});
export type FollowStep = z.infer<typeof followStep>;

const keyword = z.string().trim().toLowerCase().min(2).max(40);

export const salesAutomationFields = {
  speedEnabled: z.boolean(),
  speedTemplateId: recordId.nullable(),
  speedParams: z.array(templateParam).max(10),
  followEnabled: z.boolean(),
  followSteps: z.array(followStep).max(MAX_FOLLOW_STEPS),
  reminderEnabled: z.boolean(),
  reminderTemplateId: recordId.nullable(),
  reminderParams: z.array(templateParam).max(10),
  reminderDaysBefore: z.int().min(0).max(14),
  hotKeywords: z.array(keyword).max(30),
  hotBudgetPaise: z.int().min(0).max(10_000_000_000).nullable(),
  hotTravelDays: z.int().min(0).max(365),
};
export const saveSalesAutomationInput = z.strictObject(salesAutomationFields);
export type SaveSalesAutomationInput = z.infer<typeof saveSalesAutomationInput>;
export const salesAutomation = z.object({
  ...salesAutomationFields,
  speedParams: z.array(z.string()),
  reminderParams: z.array(z.string()),
  followSteps: z.array(z.object({ days: z.int(), templateId: recordId, params: z.array(z.string()) })),
  hotKeywords: z.array(z.string()),
});
export type SalesAutomation = z.infer<typeof salesAutomation>;

/** A lead's follow-up run, as its page shows it. */
export const cadenceStates = ["active", "done", "stopped"] as const;
export const leadCadence = z.object({
  state: z.enum(cadenceStates),
  /** Follow-ups sent so far, of how many. */
  sent: z.int(),
  steps: z.int(),
  nextAt: z.iso.datetime().nullable(),
  stopReason: z.string().nullable(),
});
export type LeadCadenceView = z.infer<typeof leadCadence>;
export const leadIdOnlyInput = z.strictObject({ leadId: recordId });

/** Why a lead is hot, strongest first. */
export const hotReasons = ["quote_opened", "asked_price", "travel_soon", "big_budget"] as const;
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
