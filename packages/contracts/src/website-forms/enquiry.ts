// What a visitor sends (spec 7.4, W8-W12, W21): a strict body whose answers are bounded here and checked against the
// form's modes by the domain. A name, a typed destination and a message may not carry web addresses (W38).
import { z } from "zod";
import { emailAddress } from "../identity/fields.js";
import { phoneNumber } from "../kernel/phone.js";
import { formVia } from "./public-form.js";
import { calendarMonth } from "../crm/trip.js";

/** A web address in free text: a scheme, "www.", or a bare name ending in a common domain. Spam's mark (W38). */
const WEB_ADDRESS =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|in|io|co|xyz|info|biz|ru|top|click|link|shop|site|online)\b)/i;

export function containsWebAddress(text: string): boolean {
  return WEB_ADDRESS.test(text);
}

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((text) => !containsWebAddress(text), { message: "Leave web addresses out" });

export const MAX_ENQUIRY_MESSAGE = 1000;
export const MAX_TYPED_DESTINATION = 80;
export const MIN_FORM_BUDGET_RUPEES = 1000;
export const MAX_FORM_BUDGET_RUPEES = 10_000_000;

export const formBudgetBases = ["everyone", "per_person"] as const;

export const formDestinationAnswer = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("existing"), destinationId: z.uuid() }),
  z.strictObject({ kind: z.literal("typed"), text: plainText(MAX_TYPED_DESTINATION) }),
]);
export type FormDestinationAnswer = z.infer<typeof formDestinationAnswer>;

export const enquiryAnswers = z.strictObject({
  name: plainText(120),
  phone: phoneNumber,
  email: emailAddress.optional(),
  destination: formDestinationAnswer.optional(),
  /** A month "2026-12", "flexible", or null for Not sure yet (W9). */
  travelMonth: z.union([calendarMonth, z.literal("flexible"), z.null()]).optional(),
  adults: z.int().min(1).max(20).optional(),
  childrenAges: z.array(z.int().min(0).max(17)).max(10).optional(),
  budget: z
    .strictObject({
      rupees: z.int().min(MIN_FORM_BUDGET_RUPEES).max(MAX_FORM_BUDGET_RUPEES),
      basis: z.enum(formBudgetBases),
    })
    .optional(),
  /** Links are counted by the domain (two are allowed, W38), so only the length is bounded here. */
  message: z.string().trim().max(MAX_ENQUIRY_MESSAGE).optional(),
  offers: z.boolean().optional(),
});
export type EnquiryAnswers = z.infer<typeof enquiryAnswers>;

export const websiteEnquiryInput = z.strictObject({
  /** Made by the page when it loads, sent with every attempt (W21). */
  submissionId: z.uuid(),
  openedToken: z.string().min(1).max(512),
  via: formVia,
  /** The host the embed sits on, for the lead's detail. */
  embeddedOn: z.string().max(80).optional(),
  /** The honeypot: a person leaves it empty (W36). */
  homepage: z.string().max(200),
  turnstileToken: z.string().max(2048).optional(),
  answers: enquiryAnswers,
});
export type WebsiteEnquiryInput = z.infer<typeof websiteEnquiryInput>;
