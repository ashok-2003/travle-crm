// The natural agent's actions (spec 3.3): each call checked against the turn's data, then staged for the act, or refused
// with why and what to do instead. Money keeps code's checks (G2, booking-checks.ts); a brochure must be one the chat
// named (G6); code places a follow-up's time (G7); a value a person set on the lead is never overwritten.
import {
  addNoteArguments,
  bookArguments,
  createTaskArguments,
  handOverArguments,
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
import { formatRupees, formatShortDay, instantAt, parseCalendarDate, parseTimeOfDay } from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { travellerWords } from "../../lite/context/lead-card.js";
import type { TripField } from "../../lite/lead-writes.js";
import { findPackages } from "../../lite/lookups/find-packages.js";
import { normalised, wordsOf } from "../../lite/read-words.js";
import { lockedFields, otherTime, sameAges, type TypedFields } from "../../lite/typed-lock.js";
import { stampOf } from "../context/chat-turns.js";
import { KIND_WORDS } from "../context/turn-block.js";
import { indexEntryOf } from "../trips/trip-sheets.js";
import { isText, roomNames } from "../trips/trip-text.js";
import type { QuoteFigures, StagedAction, StagedSet, TripSheet } from "../types.js";
import { awaitsPayment, bookChecks, offerChecks, type BookingContext } from "./booking-checks.js";
import { monthWords } from "./find-trips.js";
import { placeFollowUp } from "./follow-up-time.js";
import type { Refused } from "./quote.js";
import { termsOf, termsWords } from "./terms.js";

/** What an action is checked against: the turn's data and chat, and `quoteFor` on the turn's transaction. */
export interface ActionContext extends BookingContext {
  /** Label to package id. */
  labels: ReadonlyMap<string, string>;
  timeZone: string;
  conversationId: string;
  /** The lead's trip values a person set: never overwritten. */
  typed: TypedFields;
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

/** Checks an action call and stages it, or refuses it; `words` are this response's words, which may name a trip (G6). */
export async function stageAction(
  context: ActionContext,
  name: NaturalToolName,
  args: Record<string, unknown>,
  words: string,
): Promise<StageOutcome> {
  const checked = parseToolArguments(name, args, [...context.labels.keys()]);
  if (!checked.ok) return refused(checked.problem);
  const asked = checked.args;
  switch (name) {
    case "update_lead":
      return withArgs(updateLeadArguments, asked, (lead) => updateLead(context, lead));
    case "send_brochure":
      return withArgs(sendBrochureArguments, asked, ({ trip_id }) => sendBrochure(context, trip_id, words));
    case "offer_booking":
      return offerBooking(context, asked);
    case "book":
      return withArgs(bookArguments, asked, (yes) => book(context, asked, yes));
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
      return withArgs(handOverArguments, asked, ({ reason, summary }) =>
        stage(
          { tool: "hand_over", reason, summary },
          "handed to a person after your reply; tell them someone will reply here, with no promised time",
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
  /** The lead's field a person may have set; null for those the lock doesn't cover. */
  field: TripField | null;
  words: string;
  set: LeadFields;
  /** A person's value that differs from what the customer says now, in words; null when the same or none. */
  theirs: string | null;
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
  const packageId = asked.trip_id === undefined ? undefined : context.labels.get(asked.trip_id);
  if (packageId !== undefined)
    said.push({ field: null, words: `trip ${asked.trip_id ?? ""}`, set: { packageId }, theirs: null });
  // A day wins over a month: it says its month.
  const { date } = asked;
  const month = date === undefined ? asked.month : undefined;
  if (date !== undefined && date < today) {
    return refused(`${day(date)} is past (today is ${day(today)}); ask which date they mean`);
  }
  if (month !== undefined && month < today.slice(0, 7)) {
    return refused(`${monthName(month)} is past (today is ${day(today)}); ask which month they mean`);
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
  if (name !== "") said.push({ field: null, words: `name ${name}`, set: { name }, theirs: null });
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
  const locked = lockedFields(context.typed);
  const fields: LeadFields = {};
  const saved: string[] = [];
  const notes: string[] = [];
  for (const one of said) {
    if (one.field === null || !locked.has(one.field)) {
      Object.assign(fields, one.set);
      saved.push(one.words);
    } else if (one.theirs !== null) notes.push(`Customer now says ${one.words}; the lead says ${one.theirs}.`);
  }
  const result = [
    saved.length > 0 ? `saved: ${saved.join(", ")}` : notes.length > 0 ? "nothing saved" : "the lead says that already",
    notes.length === 0 ? null : `a person's value stands, noted for the team: ${notes.join(" ")}`,
  ];
  return stage({ tool: "update_lead", fields, notes }, result.filter(isText).join("; "));
}

/** G6: the trip is the lead's or the ad's, was priced this turn, or the new lines or these words name it. */
function chatNamed(context: ActionContext, sheet: TripSheet, words: string): boolean {
  const { packageId } = sheet;
  if (packageId === context.lead.packageId || packageId === context.adPackageId) return true;
  if (context.quotedThisTurn.some((quoted) => quoted.terms.packageId === packageId)) return true;
  // By a word of the title or place: "trek" or "tour" names a kind of trip, never this one.
  const said = wordsOf([...context.newLines.map((line) => line.text), words].join("\n"))
    .filter((word) => !KIND_WORDS.has(word))
    .join(" ");
  return findPackages([indexEntryOf(sheet)], said).exact.length > 0;
}

function sendBrochure(context: ActionContext, label: string, words: string): StageOutcome {
  const sheet = context.sheets.find((one) => one.label === label);
  if (sheet === undefined) return UNPARSED;
  const trip = `${sheet.label} ${fenced(sheet.title)}`;
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

async function offerBooking(context: ActionContext, args: Record<string, unknown>): Promise<StageOutcome> {
  const terms = termsOf(args, context.labels);
  if ("refused" in terms) return terms;
  const figures = await offerChecks(context, terms);
  if ("refused" in figures) return figures;
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
      offer: { ...figures.terms, departureId: figures.departureId, totalPaise, advancePaise, at },
    },
    `offered: ${termsWords(figures.terms, context.sheets, context.today)}; ${money}. Your words state the date and ` +
      `the ${inFull ? "total" : "advance"}, and ask for their full name or a yes`,
  );
}

async function book(
  context: ActionContext,
  args: Record<string, unknown>,
  yes: Asked<typeof bookArguments>,
): Promise<StageOutcome> {
  const terms = termsOf(args, context.labels);
  if ("refused" in terms) return terms;
  const said = { fullName: yes.full_name, customerWords: yes.customer_words };
  const checked = await bookChecks(context, terms, said);
  if ("refused" in checked) return checked;
  const { figures, via } = checked;
  const due = figures.terms.payInFull
    ? `${formatRupees(figures.totalPaise)} due now`
    : `advance ${formatRupees(figures.advancePaise)} due now`;
  return stage(
    { tool: "book", terms: figures.terms, figures, ...said, via },
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

/** A task; a call-back's time is read on the agency's clock, and must be a real day and time still to come. */
function createTask(context: ActionContext, asked: Asked<typeof createTaskArguments>): StageOutcome {
  const { kind, text } = asked;
  let callAt: Date | null = null;
  if (asked.call_at !== undefined) {
    const [day = "", time = ""] = asked.call_at.split("T");
    if (!isCalendarDate(day) || !isTimeOfDay(time)) {
      return refused(`call_at ${asked.call_at} isn't a real day and time`);
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
