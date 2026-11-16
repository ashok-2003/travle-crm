// Try it on the natural agent (spec 9.5, ruling 7), beside lite's: each turn posts the chat so far, the state the last turn
// handed back (the chat's facts and the dry lead), the chat's model and temperature and its id; it answers what the
// customer would get, the payment lines code would send after them, each action described, the next state, the lines to
// add to the chat and the trace. Nothing is sent or kept but the month's AI calls.
import { z } from "zod";
import { calendarMonth } from "../crm/trip.js";
import { recordId } from "../identity/fields.js";
import { calendarDate } from "../kernel/time.js";
import { roomType } from "../quotes/room-prices.js";
import { liveOffer, naturalFacts, naturalHandOverReasons, naturalTaskKinds, toldTotal } from "./natural.js";
import { naturalTrace } from "./natural-trace.js";
import { testAiInput, testAiLine, testAiModels, testAiTemperatures } from "./try-it.js";

/** How far a dry lead goes: Won is the team's, and Lost or Not a lead only ever suggested. */
export const dryLeadStages = ["new", "contacted", "quote_sent", "booking_requested"] as const;
export type DryLeadStage = (typeof dryLeadStages)[number];

const dryTask = { kind: z.enum(naturalTaskKinds), text: z.string().max(500) };
const dryBooking = { packageId: recordId, startsOn: calendarDate, advancePaise: z.int().min(0) };
const dryLeadShape = {
  packageId: recordId.nullable(),
  day: calendarDate.nullable(),
  month: calendarMonth.nullable(),
  adults: z.int().min(1).nullable(),
  childrenAges: z.array(z.int().min(0).max(17)),
  pickupCity: z.string().max(60).nullable(),
  room: roomType.nullable(),
  name: z.string().max(80).nullable(),
  stage: z.enum(dryLeadStages),
  notes: z.array(z.string().max(300)).max(3),
  tasks: z.array(z.object(dryTask)).max(5),
  /** The seats a turn would have held, awaiting the advance. */
  booking: z.object(dryBooking).nullable(),
};

/** The lead as the test chat keeps it: what update_lead saved, the stage, the AI's notes and tasks, a booking. */
export const dryLead = z.object(dryLeadShape);
export type DryLead = z.infer<typeof dryLead>;

export const naturalTestState = z.object({ facts: naturalFacts, lead: dryLead });
export type NaturalTestState = z.infer<typeof naturalTestState>;

/** The state as a turn posts it back: every object strict, so a key no turn handed out is refused. */
const postedState = z.strictObject({
  facts: z.strictObject({
    ...naturalFacts.shape,
    offer: z.strictObject(liveOffer.shape).nullable().default(null),
    told: z.array(z.strictObject(toldTotal.shape)).max(20).default([]),
  }),
  lead: z.strictObject({
    ...dryLeadShape,
    tasks: z.array(z.strictObject(dryTask)).max(5),
    booking: z.strictObject(dryBooking).nullable(),
  }),
});

/** The prompt a test turn runs on: the live one (Langfuse's label production), or the draft (label draft). */
export const naturalTestPrompts = ["live", "draft"] as const;
export type NaturalTestPrompt = (typeof naturalTestPrompts)[number];

export const naturalTestInput = z
  .strictObject({
    /** As lite's: oldest first, ending with the customer's line this turn answers. */
    messages: testAiInput.shape.messages,
    /** The last turn's state, sent back as it came; null starts a new chat. */
    state: postedState.nullable(),
    model: z.enum(testAiModels),
    temperature: z.enum(testAiTemperatures),
    /** Live unless the client names one, so a page loaded before the choice existed still works. */
    prompt: z.enum(naturalTestPrompts).default("live"),
    /**
     * The test chat's id, the same on each of its turns and new when it starts again: its turns' trace session. With
     * none, the turn's trace is a session of its own.
     */
    chatId: z.uuid().optional(),
  })
  .refine((input) => input.temperature === "default" || input.model === "flash", {
    message: "Only Gemini Flash takes a temperature",
    path: ["temperature"],
  });
export type NaturalTestInput = z.infer<typeof naturalTestInput>;

/** The lead's fields an update_lead saves, as the screen names them. */
export const dryLeadFields = ["trip", "dates", "adults", "children", "pickup", "room", "name"] as const;
export type DryLeadField = (typeof dryLeadFields)[number];

const trip = z.string().describe("The trip's title");
const count = z.int().min(0);
const paise = z.int().min(0);

/** What a staged action would do, one shape per tool; nothing of it is done. */
export const naturalDryAction = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("update_lead"), fields: z.array(z.enum(dryLeadFields)) }),
  z.object({ tool: z.literal("send_brochure"), trip, files: count }),
  z.object({
    tool: z.literal("offer_booking"),
    trip,
    date: calendarDate,
    people: count,
    totalPaise: paise,
    advancePaise: paise,
  }),
  z.object({ tool: z.literal("book"), trip, date: calendarDate, seats: count, advancePaise: paise }),
  z.object({ tool: z.literal("resend_payment") }),
  z.object({ tool: z.literal("plan_follow_up"), at: z.iso.datetime().nullable(), about: z.string() }),
  z.object({ tool: z.literal("create_task"), kind: z.enum(naturalTaskKinds), text: z.string() }),
  z.object({ tool: z.literal("add_note"), text: z.string() }),
  z.object({ tool: z.literal("hand_over"), reason: z.enum(naturalHandOverReasons), summary: z.string() }),
  z.object({ tool: z.literal("suggest_close"), kind: z.enum(["lost", "not_a_lead"]), reason: z.string() }),
  z.object({ tool: z.literal("stay_quiet"), reason: z.string() }),
]);
export type NaturalDryAction = z.infer<typeof naturalDryAction>;

/** How the turn ended: words went, nothing went, a person takes the chat, or the fallback line went. */
export const naturalTestOutcomes = ["replied", "quiet", "handed_off", "fallback"] as const;
export type NaturalTestOutcome = (typeof naturalTestOutcomes)[number];

export const naturalTestAnswer = z.object({
  /** What the customer would get. */
  messages: z.array(z.string()).max(2),
  /** The agency's payment lines code would send after them, with the QR; null when none would go. */
  payment: z.array(z.string()).nullable(),
  actions: z.array(naturalDryAction),
  outcome: z.enum(naturalTestOutcomes),
  state: naturalTestState,
  /** The agent's lines to add to the chat: the messages, then a mark for each brochure, offer and hold. */
  history: z.array(testAiLine),
  trace: naturalTrace,
});
export type NaturalTestAnswer = z.infer<typeof naturalTestAnswer>;
