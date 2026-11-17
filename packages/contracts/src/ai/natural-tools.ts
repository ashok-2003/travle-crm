// The natural agent's tools as the model sees them (spec 3.3): each tool's arguments in snake_case, its definition with
// the turn's trip labels as an enum, and the parse that answers a call the schema didn't allow with a sentence.
import { z } from "zod";
import { calendarMonth } from "../crm/trip.js";
import { calendarDate } from "../kernel/time.js";
import { roomType } from "../quotes/room-prices.js";
import { withoutExamples } from "./lite.js";
import { followUpWhens, naturalHandOverReasons, naturalTaskKinds } from "./natural.js";

export const naturalToolNames = [
  "find_trips",
  "get_trip",
  "quote",
  "update_lead",
  "send_brochure",
  "offer_booking",
  "book",
  "resend_payment",
  "plan_follow_up",
  "create_task",
  "add_note",
  "hand_over",
  "suggest_close",
  "stay_quiet",
] as const;
export type NaturalToolName = (typeof naturalToolNames)[number];
/** The tools that only read: the model is called again with their results. */
export const naturalReadTools: readonly NaturalToolName[] = ["find_trips", "get_trip", "quote"];
/**
 * Offered only when the turn has trips (ruling 21); `update_lead` stays, without its `trip_id`. The lookups go with the
 * trips inline too (spec 4.2): those sheets are cut, so get_trip reads past the cut and find_trips past their 8 dates.
 */
const tripTools: readonly NaturalToolName[] = [
  "find_trips",
  "get_trip",
  "quote",
  "send_brochure",
  "offer_booking",
  "book",
];

const date = calendarDate.describe("yyyy-mm-dd");
const childrenAges = z.array(z.int().min(0).max(17)).max(20).describe("Each child's age in years");
const localTime = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/;

export const findTripsArguments = z.strictObject({ query: z.string().min(1).max(80) });
export const getTripArguments = z.strictObject({ trip_id: z.string() });
export const quoteArguments = z.strictObject({
  trip_id: z.string(),
  date,
  adults: z.int().min(1).max(50),
  children_ages: childrenAges.default([]),
  room: roomType.optional(),
});
const updateLeadFields = z.strictObject({
  trip_id: z.string().optional(),
  date: date.optional(),
  month: calendarMonth.describe("yyyy-mm, when they gave a month but no day").optional(),
  adults: z.int().min(1).max(50).optional(),
  children_ages: childrenAges.optional(),
  pickup_city: z.string().max(60).optional(),
  room: roomType.optional(),
  name: z.string().max(80).optional(),
});
/** The parse-only checks JSON Schema can't say, as functions so a table can lay them over fields with other labels. */
export type Check = <Schema extends Checked>(schema: Schema) => Schema;
export type Checked = z.ZodType<Record<string, unknown>>;
const needsOneDetail: Check = (schema) =>
  schema.refine((args) => Object.keys(args).length > 0, { message: "give at least one detail the customer said" });
export const updateLeadArguments = needsOneDetail(updateLeadFields);
export const sendBrochureArguments = z.strictObject({ trip_id: z.string() });
export const offerBookingArguments = quoteArguments.extend({
  pay_in_full: z.boolean().describe("True when they pay the whole amount now, not the advance").optional(),
});
export const bookArguments = offerBookingArguments.extend({
  full_name: z.string().min(2).max(80).describe("Their full name, as on their ID"),
  customer_words: z.string().min(1).max(300).describe("Their words that said yes to the offer, copied exactly"),
});
export const resendPaymentArguments = z.strictObject({});
const planFollowUpFields = z.strictObject({
  when: z.enum(followUpWhens),
  date: date.describe("yyyy-mm-dd, only with on_date").optional(),
  about: z.string().min(1).max(200),
});
const datesGoWithOnDate: Check = (schema) =>
  schema
    .refine((args) => args.when !== "on_date" || args.date !== undefined, {
      message: "on_date needs a date",
      path: ["date"],
    })
    .refine((args) => args.when === "on_date" || args.date === undefined, {
      message: "give a date only with on_date",
      path: ["date"],
    });
export const planFollowUpArguments = datesGoWithOnDate(planFollowUpFields);
export const createTaskArguments = z.strictObject({
  kind: z.enum(naturalTaskKinds),
  text: z.string().min(1).max(500),
  call_at: z
    .string()
    .regex(localTime, "Use a time like 2026-12-13T18:30")
    .describe("When to call, yyyy-mm-ddThh:mm in the agency's time zone")
    .optional(),
});
export const addNoteArguments = z.strictObject({ text: z.string().min(1).max(300) });
export const handOverArguments = z.strictObject({
  reason: z.enum(naturalHandOverReasons),
  summary: z.string().min(1).max(300),
});
export const suggestCloseArguments = z.strictObject({
  kind: z.enum(["lost", "not_a_lead"]),
  reason: z.string().min(1).max(200),
});
export const stayQuietArguments = z.strictObject({ reason: z.string().min(1).max(200) });

type ToolFields = z.ZodObject<z.core.$ZodShape, z.core.$strict>;
export interface ToolEntry {
  description: string;
  /** The arguments as an object, for the definition. */
  fields: ToolFields;
  /** The check JSON Schema can't say, laid over the fields as parsed. */
  check: Check | undefined;
}
export type ToolTable = Record<NaturalToolName, ToolEntry>;
export const tool = (description: string, fields: ToolFields, check?: Check): ToolEntry => ({
  description,
  fields,
  check,
});

/** What each tool does, as spec 3.3's "What it does" says it. */
export const naturalTools: ToolTable = {
  find_trips: tool(
    'Finds up to 5 trips for a place, month or kind of trip. A near spelling comes back as "closest, not a match".',
    findTripsArguments,
  ),
  get_trip: tool("Gives one trip in full.", getTripArguments),
  quote: tool(
    "Prices a trip for this group: per person, total and advance, with the room used and the seat state.",
    quoteArguments,
  ),
  update_lead: tool(
    "Saves on the lead what the customer said about their trip, marked as filled by the AI.",
    updateLeadFields,
    needsOneDetail,
  ),
  send_brochure: tool(
    "Sends the trip's brochure and photos, each captioned with the trip's title.",
    sendBrochureArguments,
  ),
  offer_booking: tool(
    "Records a booking offer on the chat and returns its terms, total and advance.",
    offerBookingArguments,
  ),
  book: tool(
    "Holds the seats on the offer's terms. After your reply, the app sends the payment message and QR.",
    bookArguments,
  ),
  resend_payment: tool("Sends the payment message again.", resendPaymentArguments),
  plan_follow_up: tool(
    "Sets the next follow-up: in a few hours, this evening, tomorrow morning or evening, on a date, or none.",
    planFollowUpFields,
    datesGoWithOnDate,
  ),
  create_task: tool("Gives the team a task: a question the data can't answer, or a call back.", createTaskArguments),
  add_note: tool("Adds a note on the lead.", addNoteArguments),
  hand_over: tool(
    "Ends the turn and hands the chat to a person: the AI stops in this chat and the owner is told.",
    handOverArguments,
  ),
  suggest_close: tool("Suggests closing the lead as lost or not a lead; a person taps yes.", suggestCloseArguments),
  stay_quiet: tool("Ends the turn with no message.", stayQuietArguments),
};

export interface NaturalToolDefinition {
  name: NaturalToolName;
  description: string;
  parameters: Record<string, unknown>;
}

/** The tools this turn offers, each `trip_id` an enum of the turn's labels (ruling 8). */
export function naturalToolDefinitions(input: { tripLabels: readonly string[] }): NaturalToolDefinition[] {
  return naturalToolNames
    .filter((name) => input.tripLabels.length > 0 || !tripTools.includes(name))
    .map((name) => ({
      name,
      description: naturalTools[name].description,
      parameters: parametersOf(withLabels(naturalTools[name].fields, input.tripLabels)),
    }));
}

/** The fields with `trip_id` as an enum of the labels, or without it when the turn has none. */
export function withLabels(fields: ToolFields, labels: readonly string[]): ToolFields {
  const tripId = fields.shape.trip_id;
  if (tripId === undefined) return fields;
  if (labels.length === 0) return fields.omit({ trip_id: true });
  const label = z.enum(labels);
  return fields.extend({ trip_id: tripId instanceof z.ZodOptional ? label.optional() : label });
}

/**
 * The JSON Schema the model reads, as the parser takes it (a defaulted argument is optional), with no `examples` and
 * no `$schema` line, which tells the model nothing and costs tokens on every tool of every call.
 */
export function parametersOf(fields: z.core.$ZodType): Record<string, unknown> {
  const schema = withoutExamples(z.toJSONSchema(fields, { io: "input" }));
  return Object.fromEntries(Object.entries(schema).filter(([key]) => key !== "$schema"));
}

/**
 * A tool call checked against its tool, never thrown: an unknown tool, text that isn't JSON, a trip outside the turn's
 * labels (checked first) or arguments the schema refuses come back as a problem the model can act on.
 */
export function parseToolArguments(
  name: string,
  raw: string | Readonly<Record<string, unknown>>,
  tripLabels: readonly string[],
): { ok: true; name: NaturalToolName; args: Record<string, unknown> } | { ok: false; problem: string } {
  return parseOnTable(naturalTools, name, raw, tripLabels);
}

/** The parse, on whichever agent's table, so each agent's tools are checked by the same sentences. */
export function parseOnTable<Name extends string>(
  table: Record<Name, ToolEntry>,
  name: string,
  raw: string | Readonly<Record<string, unknown>>,
  tripLabels: readonly string[],
): { ok: true; name: Name; args: Record<string, unknown> } | { ok: false; problem: string } {
  const toolName = (Object.keys(table) as Name[]).find((known) => known === name);
  if (toolName === undefined) return { ok: false, problem: `there is no tool called ${name}` };
  const value = typeof raw === "string" ? jsonOf(raw) : raw;
  if (value === undefined) return { ok: false, problem: "the arguments weren't JSON" };
  if (!isObject(value)) return { ok: false, problem: "the arguments weren't a JSON object" };
  const entry = table[toolName];
  const tripId = value.trip_id;
  if ("trip_id" in entry.fields.shape && typeof tripId === "string" && !tripLabels.includes(tripId)) {
    const trips = tripLabels.length > 0 ? `the trips are ${tripLabels.join(", ")}` : "the agency has no trips listed";
    return { ok: false, problem: `${tripId} isn't one of the trips; ${trips}` };
  }
  const parsed = checked(entry).safeParse(value);
  if (!parsed.success) return { ok: false, problem: problemOf(parsed.error) };
  return { ok: true, name: toolName, args: parsed.data };
}

/** The tool's fields with its parse-only check on top. */
export function checked(entry: ToolEntry, fields: ToolFields = entry.fields): Checked {
  return entry.check === undefined ? fields : entry.check(fields);
}

/** The parsed text; `{}` for none, since a call without arguments may send no text; undefined when it isn't JSON. */
function jsonOf(text: string): unknown {
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Each problem with the argument it is about, in one sentence. */
function problemOf(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length === 0 ? issue.message : `${issue.path.map(String).join(".")}: ${issue.message}`))
    .join("; ");
}
