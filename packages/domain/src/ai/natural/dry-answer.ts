// What a natural dry turn would do, described and never done (spec 9.5): the messages, the payment lines code would send
// after them, each action, how the turn ended, the state the next turn reads (the stage forward only) and the lines to
// add to the chat. A model that didn't answer shows the live turn's end after its re-queues: nothing sent, and a task.
import {
  dryLeadStages,
  TEST_LINE_MAX,
  toldTotal,
  type DryLead,
  type DryLeadField,
  type DryLeadStage,
  type LiveOffer,
  type NaturalDryAction,
  type NaturalTestAnswer,
  type NaturalTestOutcome,
  type NaturalTestState,
  type ToldTotal,
} from "@travel-crm/contracts/ai";
import type { AiFailure } from "@travel-crm/integrations/ai";
import { formatRupees, formatShortDay, parseCalendarDate, type CalendarDate } from "../../kernel/index.js";
import { travellerWords } from "../lite/context/lead-card.js";
import { modelRefusal, refuse } from "../refusals.js";
import { cutText } from "./context/tokens.js";
import { amountsIn } from "./guards/amounts.js";
import { groundedSetOf } from "./guards/grounded.js";
import { BOOK_TITLE, CHANGE_TITLE, offerCardBody } from "../one/card.js";
import { stagedOf } from "./act-types.js";
import type { LoopEnd } from "./loop/types.js";
import type { NaturalTraceBuilder } from "./trace.js";
import { isText, roomNames } from "./trips/trip-text.js";
import type { QuoteFigures, StagedAction, StagedSet, TripSheet } from "./types.js";

/** What the turn read and came with, for its answer. */
export interface DryTurnRead {
  now: Date;
  today: CalendarDate;
  sheets: readonly TripSheet[];
  paymentLines: string[] | null;
  state: NaturalTestState;
  /** The customer's new lines, which the fallback's task quotes. */
  newText: string;
}

interface Ended {
  messages: string[];
  staged: StagedSet;
  /** This turn's quotes, and its offer's and booking's figures, which the loop adds as they are staged. */
  quoted: readonly QuoteFigures[];
  /** The task a fallback leaves the team. */
  task: string | null;
  outcome: NaturalTestOutcome;
  fallback: string | null;
}

const MONTH_MS = 30 * 86_400_000;
const FIELDS: Record<string, DryLeadField> = {
  packageId: "trip",
  day: "dates",
  month: "dates",
  adults: "adults",
  childrenAges: "children",
  pickupCity: "pickup",
  room: "room",
  name: "name",
};

const peopleOf = (terms: { adults: number; childrenAges: readonly number[] }) =>
  terms.adults + terms.childrenAges.length;

/**
 * The live turn re-queues a model that didn't answer twice, then sends nothing and leaves the team a task (spec 3.6);
 * with no calls left this month, or no model for the agent on this server, Try it refuses as lite's does.
 */
function modelFailed(reason: AiFailure | "limit" | "superseded", newText: string): Ended {
  if (reason === "limit") throw refuse("AI_LIMIT_REACHED", "This month's AI credits are used up", "LIMIT_REACHED");
  if (reason === "not_configured") throw modelRefusal(reason);
  const wrote = newText.trim() === "" ? "" : ` They wrote: "${cutText(newText.replace(/\s+/gu, " "), 160)}".`;
  const task =
    `The AI didn't answer (${reason}), at once or on its two later tries, so nothing went to the customer.` +
    `${wrote} Why on this turn shows what it tried.`;
  return {
    messages: [],
    staged: new Map(),
    quoted: [],
    task: cutText(task, 500),
    outcome: "fallback",
    fallback: `model_failed:${reason}`,
  };
}

function endedOf(end: LoopEnd, newText: string): Ended {
  switch (end.end) {
    case "final": {
      const { messages, staged } = end;
      const outcome = staged.has("hand_over")
        ? "handed_off"
        : messages.length === 0 && staged.has("stay_quiet")
          ? "quiet"
          : "replied";
      return { messages, staged, quoted: end.quoted, task: null, outcome, fallback: null };
    }
    case "fallback":
      return {
        messages: [],
        staged: end.staged,
        quoted: [],
        task: end.task,
        outcome: "fallback",
        fallback: end.reason,
      };
    case "model_failed":
      return modelFailed(end.reason, newText);
    case "superseded":
      // A dry turn has no newer line to give way to; were it to end so, it still answers, as a model that didn't.
      return modelFailed("superseded", newText);
  }
}

function described(action: StagedAction, titleOf: (packageId: string) => string): NaturalDryAction {
  switch (action.tool) {
    case "update_lead":
      return {
        tool: action.tool,
        fields: [...new Set(Object.keys(action.fields).flatMap((key) => FIELDS[key] ?? []))],
      };
    case "send_brochure":
      return { tool: action.tool, trip: titleOf(action.packageId), files: action.fileIds.length };
    case "offer_booking": {
      const { offer } = action;
      const money = { totalPaise: offer.totalPaise, advancePaise: offer.advancePaise };
      return {
        tool: action.tool,
        trip: titleOf(offer.packageId),
        date: offer.startsOn,
        people: peopleOf(offer),
        ...money,
      };
    }
    case "book": {
      const { terms, figures } = action;
      const held = { date: terms.startsOn, seats: peopleOf(terms), advancePaise: figures.advancePaise };
      return { tool: action.tool, trip: titleOf(terms.packageId), ...held };
    }
    case "plan_follow_up":
      return { tool: action.tool, at: action.at === null ? null : action.at.toISOString(), about: action.about };
    case "create_task":
      return { tool: action.tool, kind: action.kind, text: action.text };
    case "resend_payment":
    case "add_note":
    case "hand_over":
    case "suggest_close":
    case "stay_quiet":
      return action;
  }
}

/** Ruling 17: a quote or offer whose total the words state was told, for book's told shortcut (the live act's too). */
export function toldIn(
  ended: { messages: readonly string[]; quoted: readonly QuoteFigures[] },
  now: Date,
): ToldTotal[] {
  const amounts = amountsIn(ended.messages.join("\n\n"));
  return ended.quoted
    .filter((quote) => amounts.some((one) => groundedSetOf([quote.totalPaise]).has(one.paise, one.shorthand)))
    .map((quote) => toldTotal.parse({ ...quote.terms, totalPaise: quote.totalPaise, at: now.toISOString() }));
}

/** The totals told a chat keeps after a turn: the last 30 days' and the turn's, the newest 20 (the live act's too). */
export function toldAfter(earlier: readonly ToldTotal[], told: readonly ToldTotal[], now: Date): ToldTotal[] {
  return [...earlier.filter((one) => now.getTime() - Date.parse(one.at) <= MONTH_MS), ...told].slice(-20);
}

/** The lead after the turn: what update_lead saved (a day or a month replaces the other), notes, tasks, a booking. */
function leadAfter(lead: DryLead, ended: Ended): DryLead {
  const { staged } = ended;
  const update = stagedOf(staged, "update_lead");
  const fields = update?.fields ?? {};
  const when =
    fields.day !== undefined
      ? { day: fields.day, month: null }
      : fields.month !== undefined
        ? { day: null, month: fields.month }
        : { day: lead.day, month: lead.month };
  const note = stagedOf(staged, "add_note");
  const task = stagedOf(staged, "create_task");
  const book = stagedOf(staged, "book");
  return {
    ...lead,
    packageId: fields.packageId ?? lead.packageId,
    ...when,
    adults: fields.adults ?? lead.adults,
    childrenAges: fields.childrenAges ?? lead.childrenAges,
    pickupCity: fields.pickupCity ?? lead.pickupCity,
    room: fields.room ?? lead.room,
    name: fields.name ?? lead.name,
    notes: [...lead.notes, ...(update?.notes ?? []), ...(note === null ? [] : [note.text])]
      .map((text) => cutText(text, 300))
      .slice(-3),
    tasks: [
      ...lead.tasks,
      ...(task === null ? [] : [{ kind: task.kind, text: task.text }]),
      ...(ended.task === null ? [] : [{ kind: "question" as const, text: ended.task }]),
    ].slice(-5),
    booking:
      book === null
        ? lead.booking
        : { packageId: book.terms.packageId, startsOn: book.terms.startsOn, advancePaise: book.figures.advancePaise },
  };
}

/**
 * The stage forward only, each when its details are complete (the lead's ruling, 2026-11-15): a reply once the trip is
 * known makes Contacted, an offer or a total told Quote sent, a hold Booking requested.
 */
function stageAfter(from: DryLeadStage, ended: Ended, lead: DryLead, told: readonly ToldTotal[]): DryLeadStage {
  const { staged } = ended;
  const reached: DryLeadStage =
    stagedOf(staged, "book") !== null
      ? "booking_requested"
      : stagedOf(staged, "offer_booking") !== null || told.length > 0
        ? "quote_sent"
        : ended.messages.length > 0 && lead.packageId !== null
          ? "contacted"
          : "new";
  return dryLeadStages.indexOf(reached) > dryLeadStages.indexOf(from) ? reached : from;
}

function stateAfter(ended: Ended, read: DryTurnRead): NaturalTestState {
  const { facts } = read.state;
  const { now } = read;
  const sent = stagedOf(ended.staged, "send_brochure");
  const offered = stagedOf(ended.staged, "offer_booking");
  const told = toldIn(ended, now);
  const lead = leadAfter(read.state.lead, ended);
  return {
    facts: {
      ...facts,
      sentTripIds: sent === null ? facts.sentTripIds : [...facts.sentTripIds, sent.packageId].slice(-50),
      sentFileIds: sent === null ? facts.sentFileIds : [...facts.sentFileIds, ...sent.fileIds].slice(-150),
      // The offer made in the last turn that ran (ruling 1): a turn that made none, quiet or not, ends it.
      offer: offered?.offer ?? null,
      told: toldAfter(facts.told, told, now),
      lastTurnAt: now.toISOString(),
    },
    lead: { ...lead, stage: stageAfter(read.state.lead.stage, ended, lead, told) },
  };
}

/** "Sat 19 Dec, 2 adults, double, total ₹22,600, advance ₹5,600". */
function offerWords(offer: LiveOffer, today: CalendarDate): string {
  return [
    formatShortDay(parseCalendarDate(offer.startsOn), today),
    travellerWords(offer.adults, offer.childrenAges),
    offer.room === null ? null : roomNames[offer.room],
    `total ${formatRupees(offer.totalPaise)}`,
    offer.payInFull ? "paying in full" : `advance ${formatRupees(offer.advancePaise)}`,
  ]
    .filter(isText)
    .join(", ");
}

/** The agent's lines for the chat: each message, then a mark for what went beside it, as a live chat shows it. */
function historyOf(ended: Ended, read: DryTurnRead, titleOf: (packageId: string) => string): string[] {
  const { staged } = ended;
  const sent = stagedOf(staged, "send_brochure");
  const offered = stagedOf(staged, "offer_booking");
  const book = stagedOf(staged, "book");
  const seats = book === null ? 0 : peopleOf(book.terms);
  return [
    ...ended.messages,
    sent === null ? null : `[sent: ${titleOf(sent.packageId)} brochure]`,
    offered === null ? null : `[offered: ${offerWords(offered.offer, read.today)}]`,
    book === null
      ? null
      : `[held: ${String(seats)} ${seats === 1 ? "seat" : "seats"} on ` +
        `${formatShortDay(parseCalendarDate(book.terms.startsOn), read.today)}; payment details sent]`,
    stagedOf(staged, "resend_payment") === null ? null : "[sent: payment details]",
  ].filter(isText);
}

/** The turn's answer; throws for the month's limit and for a server with no model for the agent. */
export function dryAnswerOf(
  end: LoopEnd,
  read: DryTurnRead,
  trace: NaturalTraceBuilder,
  endedMs: number,
): NaturalTestAnswer {
  const ended = endedOf(end, read.newText);
  const titleOf = (packageId: string) =>
    read.sheets.find((sheet) => sheet.packageId === packageId)?.title ?? "a trip not on sale now";
  const actions = [...ended.staged.values()].map((action) => described(action, titleOf));
  if (ended.task !== null) actions.push({ tool: "create_task", kind: "question", text: ended.task });
  // Only the one agent's offer is sent as a card; natural's has none, and none goes beside held seats or a hand-over.
  const offered = stagedOf(ended.staged, "offer_booking");
  const card =
    offered?.card === true && ended.outcome !== "handed_off" && !ended.staged.has("book")
      ? { body: offerCardBody(offered.offer, read.sheets, read.today), buttons: [BOOK_TITLE, CHANGE_TITLE] }
      : null;
  const paying = ended.staged.has("book") || ended.staged.has("resend_payment");
  return {
    messages: ended.messages,
    payment: paying ? read.paymentLines : null,
    ...(card === null ? {} : { card }),
    actions,
    outcome: ended.outcome,
    state: stateAfter(ended, read),
    history: historyOf(ended, read, titleOf).map((text) => ({ from: "agent", text: cutText(text, TEST_LINE_MAX) })),
    trace: trace.finish(ended.outcome, ended.fallback, endedMs),
  };
}
