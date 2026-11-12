// The lite WhatsApp agent's contracts: the Understand form the model fills, the facts a chat keeps between turns, and the
// Write answer. No transforms, so `z.toJSONSchema` can hand the form to the model with every field explained.
import { z } from "zod";
import { calendarMonth } from "../crm/trip.js";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { roomType } from "../quotes/room-prices.js";
import { agencyQuestionTopics } from "./agent-setup.js";
import { understandFieldDocs, understandPartDocs } from "./lite-docs.js";

export const liteLanguages = ["english", "hindi", "hinglish"] as const;
export type LiteLanguage = (typeof liteLanguages)[number];
export const liteIntents = [
  "hello",
  "package_question",
  "price_question",
  "dates_question",
  "gives_details",
  "wants_to_book",
  "payment_sent",
  "payment_problem",
  "agency_question",
  "discount",
  "custom_trip",
  "complaint",
  "wants_person",
  "wants_call",
  "later",
  "not_interested",
  "ok_thanks",
  "asks_who_you_are",
  "other",
] as const;
export type LiteIntent = (typeof liteIntents)[number];
export const lookupTools = ["find_packages", "package_details", "dates_and_seats", "price", "agency_answer"] as const;
export type LookupTool = (typeof lookupTools)[number];
export const checklistItems = [
  "name",
  "where",
  "when",
  "people",
  "children_ages",
  "pickup",
  "room",
  "full_name",
] as const;
export type ChecklistItem = (typeof checklistItems)[number];

/** Names a field's line from the docs (or the parts list) on the schema, so the model and the prompt read one source. */
function documented<T extends z.ZodType>(schema: T, key: string): T {
  const doc = understandFieldDocs[key] ?? understandPartDocs[key];
  if (doc === undefined) throw new Error(`No doc for the form field ${key}`);
  return schema.describe(doc.description).meta({ examples: [doc.example] });
}

const proofKey = "intents[].proof / details.*.proof";
const proof = () => documented(z.string().max(300), proofKey);
const changed = () => documented(z.boolean(), "details.*.changed");

export const understandForm = z.object({
  intents: documented(
    z
      .array(
        z.object({
          name: documented(z.enum(liteIntents), "intents[].name"),
          proof: proof(),
        }),
      )
      .min(1)
      .max(2),
    "intents",
  ),
  details: documented(
    z.object({
      package: documented(
        z
          .object({ name: documented(z.string().max(120), "details.package.name"), proof: proof(), changed: changed() })
          .nullable(),
        "details.package",
      ),
      place: documented(
        z
          .object({ words: documented(z.string().max(80), "details.place.words"), proof: proof(), changed: changed() })
          .nullable(),
        "details.place",
      ),
      date: documented(
        z
          .object({
            day: documented(calendarDate.nullable(), "details.date.day"),
            month: documented(calendarMonth.nullable(), "details.date.month"),
            proof: proof(),
            changed: changed(),
          })
          .nullable(),
        "details.date",
      ),
      adults: documented(
        z
          .object({
            count: documented(z.int().min(1).max(99), "details.adults.count"),
            proof: proof(),
            changed: changed(),
          })
          .nullable(),
        "details.adults",
      ),
      children: documented(
        z
          .object({
            count: documented(z.int().min(0).max(20), "details.children.count"),
            ages: documented(z.array(z.int().min(0).max(17)).max(20), "details.children.ages"),
            proof: proof(),
            changed: changed(),
          })
          .nullable(),
        "details.children",
      ),
      name: documented(
        z.object({ full: documented(z.string().max(80), "details.name.full"), proof: proof() }).nullable(),
        "details.name",
      ),
      pickup_city: documented(
        z
          .object({
            words: documented(z.string().max(60), "details.pickup_city.words"),
            proof: proof(),
            changed: changed(),
          })
          .nullable(),
        "details.pickup_city",
      ),
      room: documented(
        z.object({ type: documented(roomType, "details.room.type"), proof: proof(), changed: changed() }).nullable(),
        "details.room",
      ),
      pay_in_full: documented(z.object({ proof: proof() }).nullable(), "details.pay_in_full"),
    }),
    "details",
  ),
  open_to_other_trips: documented(z.enum(["yes", "no", "unknown"]), "open_to_other_trips"),
  lookups: documented(
    z
      .array(
        z.object({
          tool: documented(z.enum(lookupTools), "lookups[].tool"),
          words: documented(z.string().max(80).nullable(), "lookups[].words"),
          package: documented(z.string().max(120).nullable(), "lookups[].package"),
          month: documented(calendarMonth.nullable(), "lookups[].month"),
          topic: documented(z.enum(agencyQuestionTopics).nullable(), "lookups[].topic"),
        }),
      )
      .max(4),
    "lookups",
  ),
  language: documented(z.enum(liteLanguages), "language"),
  summary: documented(z.string().max(1000), "summary"),
  score: documented(
    z.object({
      chance: documented(z.int().min(0).max(100), "score.chance"),
      label: documented(z.enum(["hot", "warm", "cold"]), "score.label"),
      reasons: documented(z.array(z.string().max(120)).max(3), "score.reasons"),
      looks_fake: documented(z.boolean(), "score.looks_fake"),
      fake_why: documented(z.string().max(160), "score.fake_why"),
      standing: documented(z.string().max(200), "score.standing"),
      next_step: documented(z.string().max(160), "score.next_step"),
    }),
    "score",
  ),
});
export type UnderstandForm = z.infer<typeof understandForm>;

/** The form as JSON Schema, for the AI port's structured output (the domain package has no zod). */
export const understandFormJsonSchema = z.toJSONSchema(understandForm) as Record<string, unknown>;

/** What a lite chat keeps in `ai_chat.facts`; `agent` is required, so a grounded row never reads as a lite one. */
export const liteFacts = z.object({
  agent: z.literal("lite"),
  packageId: recordId.nullable().default(null),
  placeWords: z.string().max(80).nullable().default(null),
  /** The customer's words for places the agency does not run. */
  notRun: z.array(z.string().max(80)).max(10).default([]),
  notRunAsked: z.boolean().default(false),
  day: calendarDate.nullable().default(null),
  month: calendarMonth.nullable().default(null),
  departureId: recordId.nullable().default(null),
  adults: z.int().min(1).nullable().default(null),
  children: z
    .object({ count: z.int().min(0), ages: z.array(z.int().min(0).max(17)) })
    .nullable()
    .default(null),
  name: z.string().max(80).nullable().default(null),
  pickupCity: z.string().max(60).nullable().default(null),
  roomType: roomType.nullable().default(null),
  payInFull: z.boolean().default(false),
  /** What the price told them, so a later booking is held to it. */
  quoted: z
    .object({ departureId: recordId, totalPaise: z.int().min(0), advancePaise: z.int().min(0) })
    .nullable()
    .default(null),
  sentFileIds: z.array(recordId).default([]),
  /** How many times each checklist item was asked, for the loop guard. */
  asked: z.array(z.object({ item: z.enum(checklistItems), times: z.int().min(1) })).default([]),
  nameSkipped: z.boolean().default(false),
  fullNameAsked: z.boolean().default(false),
  otherInARow: z.int().min(0).default(0),
  bookingId: recordId.nullable().default(null),
  language: z.enum(liteLanguages).default("english"),
  lastMove: z.string().max(40).nullable().default(null),
});
export type LiteFacts = z.infer<typeof liteFacts>;

/** What the Write model answers: the words, or that the facts do not answer the customer. */
export const liteWriteAnswer = z.object({ text: z.string().max(600), cannot_answer: z.boolean() });
export type LiteWriteAnswer = z.infer<typeof liteWriteAnswer>;
export const liteWriteAnswerJsonSchema = z.toJSONSchema(liteWriteAnswer) as Record<string, unknown>;
