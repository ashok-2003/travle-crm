// The natural agent's actions (spec 3.3): each call checked against the turn's data, then staged for the act, or refused
// with why and what to do instead. Money keeps code's checks (G2, booking-checks.ts); a brochure must be one the chat
// named (G6); code places a follow-up's time (G7); a value a person set on the lead is never overwritten.
import {
  addNoteArguments,
  bookArguments,
  createTaskArguments,
  handOverArguments,
  oneHandOverArguments,
  oneSendBrochureArguments,
  parseOneToolArguments,
  parseToolArguments,
  planFollowUpArguments,
  sendBrochureArguments,
  stayQuietArguments,
  suggestCloseArguments,
  updateLeadArguments,
  type NaturalToolName,
} from "@travel-crm/contracts/ai";
import { travelWhen, type TravelWhen } from "@travel-crm/contracts/crm";
import { isCalendarDate, isTimeOfDay } from "@travel-crm/contracts/kernel";
import { roomType } from "@travel-crm/contracts/quotes";
import {
  formatRupees,
  formatShortDay,
  instantAt,
  newUuidV7,
  parseCalendarDate,
  parseTimeOfDay,
} from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { travellerWords } from "../../lite/context/lead-card.js";
import type { TripField } from "../../lite/lead-writes.js";
import { normalised } from "../../lite/read-words.js";
import { lockedFields, otherTime, sameAges } from "../../lite/typed-lock.js";
import { stampOf } from "../context/chat-turns.js";
import { namedTrips } from "../context/turn-block.js";
import { brochureLabelsOf } from "../trips/brochures.js";
import { isText, roomNames } from "../trips/trip-text.js";
import type { QuoteFigures, StagedAction, StagedSet, TripSheet } from "../types.js";
import { awaitsPayment, bookChecks, offerChecks, type BookingContext, type RefusedToTeam } from "./booking-checks.js";
import { monthWords } from "./find-trips.js";
import { placeFollowUp } from "./follow-up-time.js";
import { nextDay, nextMonth } from "./next-date.js";
import { openTaskRefusal } from "./open-task.js";
import type { Refused } from "./quote.js";
import { termsOf, termsWords } from "./terms.js";

/** A field of the lead a person may set: lite's trip fields (a trip's is its place), and the customer's name. */
type LockField = TripField | "name";
/** The lead's values a person set, by field: lite's (`typedByPerson`'s), and a name a person typed. */
export type PersonValues = Partial<Record<LockField, unknown>>;

/** What an action is checked against: the turn's data and chat, and `quoteFor` on the turn's transaction. */
export interface ActionContext extends BookingContext {
  /** Label to package id. */
  labels: ReadonlyMap<string, string>;
  timeZone: string;
  conversationId: string;
  /** The lead's values a person set: never overwritten. */
  typed: PersonValues;
  lastInboundAt: Date;
  /** The trip of the ad they came from. */
  adPackageId: string | null;
  /** This turn's quotes, and its offer's figures once made: a trip priced this turn is one the chat is about (G6). */
  quotedThisTurn: readonly QuoteFigures[];
}

export type StageOutcome = { staged: StagedAction; result: string } | Refused;

/** Most files a brochure sends: brochures first, then photos. */
const MOST_FILES = 3;

const refused = (why: string): Refused => ({ refused: `refused: ${why}` });
const UNPARSED = refused("the arguments weren't understood");
const stage = (staged: StagedAction, result: string): StageOutcome => ({ staged, result });

type Parsed<T> = { success: true; data: T } | { success: false };
/** A tool's arguments as its schema parses them. */
type Asked<S> = S extends { safeParse: (value: unknown) => Parsed<infer T> } ? T : never;

/** Runs `then` on the arguments typed by the tool's schema, which they passed already in `parseToolArguments`. */
function withArgs<T, R>(
  schema: { safeParse: (value: unknown) => Parsed<T> },
  args: Record<string, unknown>,
  then: (asked: T) => R,
): R | Refused {
  const parsed = schema.safeParse(args);
  return parsed.success ? then(parsed.data) : UNPARSED;
}

/** A later call of one tool replaces the earlier (spec 3.2). */
export function withStaged(set: StagedSet, action: StagedAction): StagedSet {
  return new Map(set).set(action.tool, action);
}

/** A refusal that is the team's becomes the hand-over itself, through the same staging as the model's `hand_over`. */
function handedOver(refusal: Refused | RefusedToTeam): StageOutcome {
  if (!("handOver" in refusal)) return refusal;
  const { reason, summary } = refusal.handOver;
  const staged: StagedAction = { tool: "hand_over", reason, summary };
  const what = reason === "big_group" ? "big group" : "existing booking";
  return stage(staged, `handed to the team (${what}): tell them a person will help with it`);
}

/** Checks an action call and stages it, or refuses it; `words` are this response's words, which may name a trip (G6). */
export async function stageAction(
  context: ActionContext,
  name: NaturalToolName,
  args: Record<string, unknown>,
  words: string,
  options: { agent?: "natural" | "one" } = {},
): Promise<StageOutcome> {
  const one = options.agent === "one";
  const labels = [...context.labels.keys()];
  const brochureLabels = [...brochureLabelsOf(context.sheets).keys()];
  const checked = one
    ? parseOneToolArguments(name, args, labels, { brochureLabels })
    : parseToolArguments(name, args, labels);
  if (!checked.ok) return refused(checked.problem);
  const asked = checked.args;
  switch (name) {
    case "update_lead":
      return withArgs(updateLeadArguments, asked, (lead) => updateLead(context, lead));
    case "send_brochure":
      return one
        ? withArgs(oneSendBrochureArguments, asked, ({ brochure_id }) => sendOneBrochure(context, brochure_id))
        : withArgs(sendBrochureArguments, asked, ({ trip_id }) => sendBrochure(context, trip_id, words));
    case "offer_booking":
      return offerBooking(context, asked, one);
    case "book":
      return one ? bookOnTerms(context, asked) : withArgs(bookArguments, asked, (yes) => book(context, asked, yes));
    case "resend_payment":
      return awaitsPayment(context.booking)
        ? stage({ tool: "resend_payment" }, "the app sends the payment message and QR again after your reply")
        : refused("no booking from this chat is waiting for payment; to book, offer_booking first");
    case "plan_follow_up":
      return withArgs(planFollowUpArguments, asked, (plan) => planFollowUp(context, plan));
    case "create_task":
      return withArgs(createTaskArguments, asked, (task) => createTask(context, task));
    case "add_note":
      return withArgs(addNoteArguments, asked, ({ text }) =>
        stage({ tool: "add_note", text }, "note added for the team"),
      );
    case "hand_over":
      return withArgs(one ? oneHandOverArguments : handOverArguments, asked, ({ reason, summary }) =>
        stage(
          { tool: "hand_over", reason, summary },
          "handed to a person after your reply; as one of the team, say you'll check and get back to them here, with no promised time",
        ),
      );
    case "suggest_close":
      return withArgs(suggestCloseArguments, asked, ({ kind, reason }) =>
        stage(
          { tool: "suggest_close", kind, reason },
          `suggested: ${kind === "lost" ? "lost" : "not a lead"}; a person decides`,
        ),
      );
    case "stay_quiet":
      return withArgs(stayQuietArguments, asked, ({ reason }) =>
        stage({ tool: "stay_quiet", reason }, "no message goes"),
      );
    case "find_trips":
    case "get_trip":
    case "quote":
      return refused(`${name} only reads; it stages nothing`);
  }
}

type LeadFields = Extract<StagedAction, { tool: "update_lead" }>["fields"];
interface Said {
  /** The lead's field a person may have set. */
  field: LockField;
  words: string;
  /** How the team's note names it, when not as `words`: a trip by its title, as its label means nothing to them. */
  noted?: string;
  set: LeadFields;
  /** A person's value that differs from what the customer says now, in words; null when the same or none. */
  theirs: string | null;
  /** Saved though a person set the field: it agrees with their value and fills what they left empty. */
  fills?: boolean;
}

/** The place a person set on the lead (`typedByPerson` gives `{ kind: "existing", destinationId }`), else null. */
function theirPlaceId(typed: PersonValues): string | null {
  const { destination } = typed;
  if (typeof destination !== "object" || destination === null || !("destinationId" in destination)) return null;
  return typeof destination.destinationId === "string" ? destination.destinationId : null;
}

/** What the customer said, field by field, beside a person's value; a day or month already past is refused. */
function saidOf(context: ActionContext, asked: Asked<typeof updateLeadArguments>): Said[] | Refused {
  const { today, typed } = context;
  const day = (date: string) => formatShortDay(parseCalendarDate(date), today);
  const monthName = (month: string) => monthWords([month], today);
  const whenWords = (when: TravelWhen) =>
    when.kind === "dates" ? day(when.from) : when.kind === "month" ? monthName(when.month) : when.kind;
  const childrenWords = (ages: readonly number[]) =>
    ages.length === 0 ? "no children" : (travellerWords(null, [...ages]) ?? "");
  const said: Said[] = [];
  const sheet = context.sheets.find((one) => one.label === asked.trip_id);
  if (sheet !== undefined) {
    const place = theirPlaceId(typed);
    const elsewhere = place !== null && place !== sheet.destinationId;
    const leadTrip = context.lead.packageId;
    const otherTrip = leadTrip !== null && leadTrip !== sheet.packageId;
    said.push({
      field: "destination",
      words: `trip ${fenced(sheet.title)}`,
      noted: sheet.title,
      set: { packageId: sheet.packageId },
      // A person's place, named by a trip that goes there; at their place, the lead's other trip is theirs to choose.
      theirs: elsewhere
        ? (context.sheets.find((one) => one.destinationId === place)?.place ?? "another place")
        : otherTrip
          ? (context.sheets.find((one) => one.packageId === leadTrip)?.title ?? "another trip")
          : null,
      // A trip at their place is new when the lead has none yet.
      fills: place !== null && !elsewhere && leadTrip === null,
    });
  }
  // A day wins over a month: it says its month.
  const { date } = asked;
  const month = date === undefined ? asked.month : undefined;
  if (date !== undefined && date < today) {
    const next = nextDay(date, today);
    return refused(
      next === null
        ? `${day(date)} is past (today is ${day(today)}); ask which date they mean`
        : `${date} is past (today is ${day(today)}); the next is ${day(next)} (${next}): ` +
            "use it if that's the one they mean",
    );
  }
  if (month !== undefined && month < today.slice(0, 7)) {
    const next = nextMonth(month, today);
    return refused(
      `${month} is past (today is ${day(today)}); the next is ${monthName(next)} (${next}): ` +
        "use it if that's the one they mean",
    );
  }
  if (date !== undefined || month !== undefined) {
    const theirs = travelWhen.safeParse(typed.when);
    // A day inside the month a person set narrows it: no note.
    const differs = theirs.success && otherTime(theirs.data, { day: date ?? null, month: month ?? null });
    said.push({
      field: "when",
      words: date === undefined ? monthName(month ?? "") : day(date),
      set: date === undefined ? { month: month ?? "" } : { day: parseCalendarDate(date) },
      theirs: differs ? whenWords(theirs.data) : null,
    });
  }
  if (asked.adults !== undefined) {
    const theirs = typed.adults;
    said.push({
      field: "adults",
      words: travellerWords(asked.adults, []) ?? "",
      set: { adults: asked.adults },
      theirs: typeof theirs === "number" && theirs !== asked.adults ? String(theirs) : null,
    });
  }
  if (asked.children_ages !== undefined) {
    const theirs = Array.isArray(typed.children_ages)
      ? typed.children_ages.filter((age): age is number => typeof age === "number")
      : null;
    said.push({
      field: "children_ages",
      words: childrenWords(asked.children_ages),
      set: { childrenAges: asked.children_ages },
      theirs: theirs !== null && !sameAges(theirs, asked.children_ages) ? childrenWords(theirs) : null,
    });
  }
  const city = asked.pickup_city?.trim() ?? "";
  if (city !== "") {
    const theirs = typed.departure_city;
    said.push({
      field: "departure_city",
      words: `pickup ${city}`,
      set: { pickupCity: city },
      theirs: typeof theirs === "string" && normalised(theirs) !== normalised(city) ? theirs : null,
    });
  }
  if (asked.room !== undefined) {
    const theirs = roomType.safeParse(typed.room_type);
    said.push({
      field: "room_type",
      words: `${roomNames[asked.room]} room`,
      set: { room: asked.room },
      theirs: theirs.success && theirs.data !== asked.room ? roomNames[theirs.data] : null,
    });
  }
  const name = asked.name?.trim() ?? "";
  if (name !== "") {
    const theirs = typed.name;
    said.push({
      field: "name",
      words: `name ${name}`,
      set: { name },
      theirs: typeof theirs === "string" && normalised(theirs) !== normalised(name) ? theirs : null,
    });
  }
  return said;
}

/**
 * `update_lead` (spec 3.3): a value no person set is saved; a person's value stands, and the customer's different one
 * goes to the team as a note.
 */
function updateLead(context: ActionContext, asked: Asked<typeof updateLeadArguments>): StageOutcome {
  const said = saidOf(context, asked);
  if ("refused" in said) return said;
  if (said.length === 0) return refused("give at least one detail the customer said");
  // Lite's lock (each value a person set, but a flexible time), and a name a person typed.
  const locked = new Set<LockField>(lockedFields(context.typed));
  if (context.typed.name !== undefined) locked.add("name");
  const fields: LeadFields = {};
  const saved: string[] = [];
  const notes: string[] = [];
  for (const one of said) {
    if (!locked.has(one.field) || one.fills === true) {
      Object.assign(fields, one.set);
      saved.push(one.words);
    } else if (one.theirs !== null) {
      notes.push(`Customer now says ${one.noted ?? one.words}; the lead says ${one.theirs}.`);
    }
  }
  const result = [
    saved.length > 0 ? `saved: ${saved.join(", ")}` : notes.length > 0 ? "nothing saved" : "the lead says that already",
    notes.length === 0 ? null : `a person's value stands, noted for the team: ${notes.join(" ")}`,
  ];
  return stage({ tool: "update_lead", fields, notes }, result.filter(isText).join("; "));
}

/**
 * G6: the trip is the lead's or the ad's, was priced this turn, or the new lines or this reply name it, by the turn's
 * one rule (`namedTrips`). Each is read alone, so a trip the reply names counts beside one the customer named more fully.
 */
function chatNamed(context: ActionContext, sheet: TripSheet, words: string): boolean {
  const { packageId } = sheet;
  if (packageId === context.lead.packageId || packageId === context.adPackageId) return true;
  if (context.quotedThisTurn.some((quoted) => quoted.terms.packageId === packageId)) return true;
  const newLines = context.newLines.map((line) => line.text).join("\n");
  return [newLines, words].some((text) => namedTrips(context.sheets, text).includes(packageId));
}

function sendBrochure(context: ActionContext, label: string, words: string): StageOutcome {
  const sheet = context.sheets.find((one) => one.label === label);
  if (sheet === undefined) return UNPARSED;
  const trip = fenced(sheet.title);
  if (context.facts.sentTripIds.includes(sheet.packageId)) {
    return refused(`${trip}'s brochure went in this chat already; point them to it, or answer in words`);
  }
  if (sheet.fileIds.length === 0) return refused(`${trip} has no brochure or photos; describe it in words`);
  if (!chatNamed(context, sheet, words)) return refused(`the chat hasn't named ${trip}: name it, or ask which trip`);
  const fileIds = sheet.fileIds.slice(0, MOST_FILES);
  const files = `${String(fileIds.length)} ${fileIds.length === 1 ? "file" : "files"}`;
  return stage(
    { tool: "send_brochure", packageId: sheet.packageId, fileIds },
    `goes with your reply: ${trip}'s brochure and photos, ${files}`,
  );
}

/** The one agent's brochure: any listed one, again when asked; its photos not sent before fill the rest of the three. */
function sendOneBrochure(context: ActionContext, label: string): StageOutcome {
  const brochure = brochureLabelsOf(context.sheets).get(label);
  const sheet = context.sheets.find((one) => one.packageId === brochure?.packageId);
  if (brochure === undefined || sheet === undefined) return UNPARSED;
  const sent = new Set(context.facts.sentFileIds);
  const photoIds = sheet.photoIds.filter((id) => !sent.has(id));
  const fileIds = [brochure.attachmentId, ...photoIds].slice(0, MOST_FILES);
  const again = sent.has(brochure.attachmentId) ? "; it went in this chat before and goes again" : "";
  return stage(
    {
      tool: "send_brochure",
      packageId: brochure.packageId,
      fileIds,
      caption: brochure.name,
      resend: [brochure.attachmentId],
    },
    `goes with your reply: ${brochure.name}, and ${String(fileIds.length - 1)} photos${again}`,
  );
}

async function offerBooking(
  context: ActionContext,
  args: Record<string, unknown>,
  one: boolean,
): Promise<StageOutcome> {
  const terms = termsOf(args, context.labels);
  if ("refused" in terms) return terms;
  const figures = await offerChecks(context, terms);
  if ("refused" in figures) return handedOver(figures);
  const { totalPaise, advancePaise } = figures;
  const inFull = figures.terms.payInFull;
  const money = inFull
    ? `total ${formatRupees(totalPaise)}, all due now`
    : `total ${formatRupees(totalPaise)}; advance ${formatRupees(advancePaise)} ` +
      `(${formatRupees(figures.advancePerPersonPaise)} per person)`;
  const at = context.now.toISOString();
  return stage(
    {
      tool: "offer_booking",
      offer: {
        // The one agent's card names its offer in its buttons.
        ...(one ? { id: newUuidV7() } : {}),
        ...figures.terms,
        departureId: figures.departureId,
        totalPaise,
        advancePaise,
        at,
      },
      figures,
      ...(one ? { card: true as const } : {}),
    },
    `offered: ${termsWords(figures.terms, context.sheets, context.today)}; ${money}. ` +
      (one
        ? // The card carries the figures, so the model's line stays short.
          "The app sends the offer card with these figures and Book and Change buttons after your words: keep your line short and don't retype the figures"
        : `Your words state the date and the ${inFull ? "total" : "advance"}, and ask for their full name or a yes`),
  );
}

async function book(
  context: ActionContext,
  args: Record<string, unknown>,
  yes: Asked<typeof bookArguments>,
): Promise<StageOutcome> {
  return stageBook(context, args, { fullName: yes.full_name, customerWords: yes.customer_words });
}

/** The one agent's `book`: the terms alone, held on the live offer or a total told, with no name or words kept. */
function bookOnTerms(context: ActionContext, args: Record<string, unknown>): Promise<StageOutcome> {
  return stageBook(context, args, null);
}

async function stageBook(
  context: ActionContext,
  args: Record<string, unknown>,
  said: { fullName: string; customerWords: string } | null,
): Promise<StageOutcome> {
  const terms = termsOf(args, context.labels);
  if ("refused" in terms) return terms;
  const checked = await bookChecks(context, terms, said);
  if ("refused" in checked) return handedOver(checked);
  const { figures, via } = checked;
  const due = figures.terms.payInFull
    ? `${formatRupees(figures.totalPaise)} due now`
    : `advance ${formatRupees(figures.advancePaise)} due now`;
  return stage(
    {
      tool: "book",
      terms: figures.terms,
      figures,
      fullName: said?.fullName ?? null,
      customerWords: said?.customerWords ?? null,
      via,
    },
    `held once your reply goes: ${termsWords(figures.terms, context.sheets, context.today)}; total ` +
      `${formatRupees(figures.totalPaise)}; ${due}. The app then sends the payment message and QR: leave payment ` +
      "details out of your words",
  );
}

function planFollowUp(context: ActionContext, asked: Asked<typeof planFollowUpArguments>): StageOutcome {
  const at = placeFollowUp({
    when: asked.when,
    date: asked.date === undefined ? null : parseCalendarDate(asked.date),
    now: context.now,
    lastInboundAt: context.lastInboundAt,
    timeZone: context.timeZone,
    conversationId: context.conversationId,
  });
  if (at !== null && "refused" in at) return at;
  return stage(
    { tool: "plan_follow_up", at, about: asked.about },
    at === null ? "no follow-up planned" : `follow-up planned for ${stampOf(at, context)}`,
  );
}

/**
 * A task; a call-back's time is read on the agency's clock, and must be a real day and time still to come. One the team
 * already has open from the AI is refused (open-task.ts).
 */
function createTask(context: ActionContext, asked: Asked<typeof createTaskArguments>): StageOutcome {
  const { kind, text } = asked;
  const open = openTaskRefusal(context.lead.openTasks, { kind, text }, context);
  if (open !== null) return open;
  let callAt: Date | null = null;
  if (asked.call_at !== undefined) {
    const [day = "", time = ""] = asked.call_at.split("T");
    if (!isCalendarDate(day) || !isTimeOfDay(time)) {
      return refused(`call_at ${asked.call_at} isn't a real day and time; give one like 2026-12-13T18:30`);
    }
    callAt = instantAt(parseCalendarDate(day), parseTimeOfDay(time), context.timeZone);
    if (callAt <= context.now) return refused(`call_at ${stampOf(callAt, context)} is past; give a later time`);
  }
  const at = callAt === null ? "" : ` at ${stampOf(callAt, context)}`;
  return stage(
    { tool: "create_task", kind, text, callAt },
    `${kind === "call_back" ? "call-back" : "question"} task for the team${at}`,
  );
}
