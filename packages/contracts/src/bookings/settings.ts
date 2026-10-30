// How an agency's bookings run (release 6): the default payment schedule, when travellers' details lock, the reminders and
// the WhatsApp templates they use, the packing list, the emergency contact, the cancellation steps and notes, and the
// review link. One settings row, and the cancellation policy's rules.
import { z } from "zod";
import { recordId } from "../identity/fields.js";
import { templateParam } from "../sales/sales.js";
import { policyRule, travellerLevel } from "./bookings.js";

const text = (max: number) => z.string().trim().max(max);
const params = z.array(templateParam).max(10);

export const bookingSettingsFields = {
  /** The share (basis points) asked as the advance when a booking is confirmed. */
  advanceBasisPoints: z.int().min(0).max(10_000),
  /** The balance falls due this many days before departure. */
  balanceDaysBefore: z.int().min(0).max(365),
  /** Travellers' details lock this many days before departure. */
  detailsCutoffDays: z.int().min(0).max(60),
  defaultLevel: travellerLevel,
  /** Days before an unpaid payment's day that its reminder goes; 0 is the day itself. */
  balanceReminderDays: z.array(z.int().min(0).max(60)).max(4),
  detailsReminderDays: z.int().min(0).max(60),
  balanceTemplateId: recordId.nullable(),
  balanceParams: params,
  detailsTemplateId: recordId.nullable(),
  detailsParams: params,
  reportingTemplateId: recordId.nullable(),
  reportingParams: params,
  feedbackTemplateId: recordId.nullable(),
  feedbackParams: params,
  packingList: text(2000),
  emergencyName: text(120),
  emergencyPhone: text(40),
  bankDetails: text(500),
  cancellationNotes: text(1000),
  googleReviewUrl: text(500).refine(
    (value) => value === "" || /^https:\/\/\S+$/.test(value),
    "Use a link starting with https://",
  ),
};
export const bookingSettings = z.object(bookingSettingsFields);
export type BookingSettings = z.infer<typeof bookingSettings>;

/** The steps start at 0 days, none repeats a day count, so every day before departure has exactly one step. */
function stepsHaveNoGaps(rules: readonly { daysBeforeMin: number }[]): boolean {
  const days = rules.map((rule) => rule.daysBeforeMin);
  return new Set(days).size === days.length && days.includes(0);
}

export const saveBookingSettingsInput = z.strictObject({
  ...bookingSettingsFields,
  rules: z
    .array(policyRule)
    .min(1)
    .max(12)
    .refine(stepsHaveNoGaps, { message: "The first step starts at 0 days and no two steps start on the same day" }),
});
export type SaveBookingSettingsInput = z.infer<typeof saveBookingSettingsInput>;

export const bookingSettingsView = z.object({ ...bookingSettingsFields, rules: z.array(policyRule) });
export type BookingSettingsView = z.infer<typeof bookingSettingsView>;
