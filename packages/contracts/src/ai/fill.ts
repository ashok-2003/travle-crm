// "Fill it for me" (release ai2a): the AI reads typed or dictated words, a pasted message, a screenshot, a recording or a chat
// and proposes values for a form. It proposes, a person applies and saves, and nothing here ever carries a price, a tax, a GST
// place, a payment amount or a booking status: those paths do not exist. Dates, phone numbers, destinations, money and
// enums in a proposal were resolved by code, not by the model.
import { z } from "zod";
import { budgetInput, travelWhen } from "../crm/trip.js";
import { callOutcome } from "../crm/calls.js";
import {
  foodPreference,
  hotelCategory,
  instagramHandle,
  noteBody,
  personName,
  shortText,
  tripType,
} from "../crm/fields.js";
import { emailAddress, recordId } from "../identity/fields.js";
import { wallClockTime, calendarDate } from "../kernel/time.js";
import { aiInputFileTypes, MAX_AI_AUDIO_BYTES, MAX_AI_IMAGE_BYTES, presignedUpload } from "../files/attachments.js";
import { quoteDay, quoteItem } from "../quotes/quotes.js";

export const fillTargets = ["lead", "lead_edit", "quote", "call_note"] as const;
export const fillTarget = z.enum(fillTargets);
export type FillTarget = z.infer<typeof fillTarget>;

/** How much typed or pasted text a fill reads; a longer one is cut to its newest part and the answer says so. */
export const AI_FILL_TEXT_MAX = 4000;
/** What the browser may send in one request (a long forwarded chat), before the server cuts it. */
const AI_FILL_TEXT_SEND_MAX = 40_000;

export const fillSource = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("text"), text: z.string().trim().min(1).max(AI_FILL_TEXT_SEND_MAX) }),
  /** A recording or a screenshot the browser put in storage (requestAiInput), with words that go with it, if any. */
  z.strictObject({
    kind: z.literal("upload"),
    attachmentId: recordId,
    text: z.string().trim().max(AI_FILL_TEXT_SEND_MAX).optional(),
  }),
  /** A conversation the member can see: its last 20 messages are read on the server. */
  z.strictObject({ kind: z.literal("chat"), conversationId: recordId }),
]);
export type FillSource = z.infer<typeof fillSource>;

export const aiFillInput = z.strictObject({
  target: fillTarget,
  /** The lead or quote being changed, for the targets that change one. */
  subjectId: recordId.optional(),
  source: fillSource,
});
export type AiFillInput = z.infer<typeof aiFillInput>;

const fillDestination = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("existing"), destinationId: recordId, name: z.string() }),
  z.strictObject({ kind: z.literal("new"), name: z.string() }),
]);

const fillQuoteItem = z.strictObject({
  description: quoteItem.shape.description,
  detail: quoteItem.shape.detail,
  quantity: quoteItem.shape.quantity,
});
const fillFollowUp = z.strictObject({ due: wallClockTime, title: z.string().max(200).optional() });

/**
 * Every path a fill may propose and the shape of its value. There is no path for a price, a tax rate, a place of supply, a
 * payment or a booking status, so none can be proposed, whatever the model says.
 */
export const fillValueSchemas = {
  "person.name": personName,
  "person.phone": z.string().max(20),
  "person.email": emailAddress,
  "person.instagramHandle": instagramHandle,
  "trip.destination": fillDestination,
  "trip.when": travelWhen,
  "trip.adults": z.int().min(1).max(99),
  "trip.childrenAges": z.array(z.int().min(0).max(17)).max(20),
  "trip.budget": budgetInput,
  "trip.departureCity": shortText,
  "trip.tripType": tripType,
  "trip.hotelCategory": hotelCategory,
  "trip.food": foodPreference,
  "trip.roomType": shortText,
  note: noteBody,
  "call.outcome": callOutcome,
  "call.note": z.string().trim().min(1).max(2000),
  "call.followUp": fillFollowUp,
  "quote.title": z.string().trim().min(1).max(120),
  "quote.startDate": calendarDate,
  "quote.adults": z.int().min(0).max(500),
  "quote.children": z.int().min(0).max(500),
  "quote.days": z.array(quoteDay),
  "quote.items": z.array(fillQuoteItem),
  "quote.inclusions": z.string().trim().max(3000),
  "quote.exclusions": z.string().trim().max(3000),
  "quote.notes": z.string().trim().max(3000),
} as const;
export type FillPath = keyof typeof fillValueSchemas;
export const fillPaths = Object.keys(fillValueSchemas) as FillPath[];
export const fillPath = z.enum(fillPaths as [FillPath, ...FillPath[]]);

const tripPaths = [
  "trip.destination",
  "trip.when",
  "trip.adults",
  "trip.childrenAges",
  "trip.budget",
  "trip.departureCity",
  "trip.tripType",
  "trip.hotelCategory",
  "trip.food",
  "trip.roomType",
] as const satisfies readonly FillPath[];

/** The paths each target may propose, in the order its form shows them. */
export const fillTargetPaths = {
  lead: ["person.name", "person.phone", "person.email", "person.instagramHandle", ...tripPaths, "note"],
  lead_edit: tripPaths,
  quote: [
    "quote.title",
    "quote.startDate",
    "quote.adults",
    "quote.children",
    "quote.days",
    "quote.items",
    "quote.inclusions",
    "quote.exclusions",
    "quote.notes",
  ],
  call_note: ["call.outcome", "call.note", "call.followUp", ...tripPaths],
} as const satisfies Record<FillTarget, readonly FillPath[]>;

/** Where a proposed value came from. */
export const fillSources = ["voice", "text", "image", "chat"] as const;

export const aiFillField = z.object({
  path: fillPath,
  /** Checked against fillValueSchemas[path] by whoever reads it. */
  value: z.json(),
  from: z.enum(fillSources),
  /** The words that gave it, as spoken or written (up to 200 characters). */
  excerpt: z.string(),
});
export type AiFillField = z.infer<typeof aiFillField>;

export const aiFillProposal = z.object({
  /** Quoted back on save, so the save is audited as drafted by AI. */
  fillId: recordId,
  fields: z.array(aiFillField),
  /** What the source did not say and the form needs: "Which month?". */
  questions: z.array(z.string()),
  /** The source was longer than the limit: only its newest part was read. */
  truncated: z.boolean(),
  usedThisMonth: z.int(),
  monthlyLimit: z.int(),
});
export type AiFillProposal = z.infer<typeof aiFillProposal>;

/** Step one of a recording or a screenshot: where the browser puts it. */
export const requestAiInputInput = z.strictObject({
  contentType: z.enum(aiInputFileTypes),
  sizeBytes: z.int().min(1).max(Math.max(MAX_AI_AUDIO_BYTES, MAX_AI_IMAGE_BYTES)),
});
export type RequestAiInputInput = z.infer<typeof requestAiInputInput>;
export const aiInputSlot = z.object({ recordId, attachmentId: recordId, upload: presignedUpload });
export const confirmAiInputInput = z.strictObject({ recordId, attachmentId: recordId });
export type ConfirmAiInputInput = z.infer<typeof confirmAiInputInput>;

/** A lead field the AI suggested from the customer's opening messages, until a person confirms or dismisses it. */
export const suggestedLeadFields = [
  "destination",
  "when",
  "adults",
  "children_ages",
  "budget",
  "departure_city",
  "trip_type",
  "hotel_category",
  "food",
  "room_type",
] as const;
export const suggestedLeadField = z.enum(suggestedLeadFields);
export type SuggestedLeadField = z.infer<typeof suggestedLeadField>;
export const leadAiFieldsInput = z.strictObject({ leadId: recordId });
export const decideLeadAiFieldsInput = z.strictObject({ leadId: recordId, decision: z.enum(["confirm", "dismiss"]) });
export const leadAiFields = z.object({
  /** The suggestions still holding what the AI wrote, with that value (the lead's own) and the customer's words. */
  fields: z.array(z.object({ field: suggestedLeadField, path: fillPath, value: z.unknown(), excerpt: z.string() })),
});
export type LeadAiFields = z.infer<typeof leadAiFields>;
