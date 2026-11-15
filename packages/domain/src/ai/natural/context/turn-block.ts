// The turn block (spec 4.4), the final user message: the time and what the chat has had, the lead, the trips this chat
// is about in full when the trips are indexed (as many as fit the budget), what the app did, then the new lines.
import { type LiveOffer, type NaturalFacts } from "@travel-crm/contracts/ai";
import {
  calendarDateIn,
  formatRupees,
  formatShortDay,
  parseCalendarDate,
  type CalendarDate,
} from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { oneLine } from "../../lite/context/blocks.js";
import { stageLabel } from "../../lite/context/lead-card.js";
import { clockWords } from "../../lite/context/messages.js";
import { WAKING_HOURS } from "../../lite/follow-ups.js";
import { findPackages } from "../../lite/lookups/find-packages.js";
import { roomNames, tripInFull } from "../trips/trip-text.js";
import type { NaturalChatLine, NaturalLeadView, TripSheet } from "../types.js";
import { customerLine, stampOf } from "./chat-turns.js";
import { cutText, estimateTokens, NATURAL_BUDGETS } from "./tokens.js";

const MOST_FOCUS_TRIPS = 3;
const SUMMARY_CUT = 600;
const NOTE_CUT = 300;
const TASK_CUT = 200;

export interface TurnBlockInput {
  now: Date;
  today: CalendarDate;
  timeZone: string;
  lead: NaturalLeadView;
  facts: NaturalFacts;
  cameFrom: { source: string; packageId: string | null } | null;
  notice: string | null;
  newLines: readonly NaturalChatLine[];
  sheets: readonly TripSheet[];
  indexed: boolean;
}

const isText = (part: string | null): part is string => part !== null && part !== "";
/** A clock time of the agency's day, "21:00" as "9 pm". */
const hourWords = (time: string) => clockWords(new Date(`1970-01-01T${time}:00Z`), "UTC");
const monthName = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

function partyWords(adults: number | null, childrenAges: readonly number[]): string | null {
  const children =
    childrenAges.length === 0
      ? null
      : `${String(childrenAges.length)} ${childrenAges.length === 1 ? "child" : "children"} (${childrenAges.join(", ")})`;
  const grown = adults === null ? null : `${String(adults)} ${adults === 1 ? "adult" : "adults"}`;
  const words = [grown, children].filter(isText);
  return words.length === 0 ? null : words.join(" and ");
}

function whenWords(lead: NaturalLeadView, today: CalendarDate): string | null {
  if (lead.day !== null) return formatShortDay(lead.day, today);
  if (lead.month === null) return null;
  const [year, month] = lead.month.split("-").map(Number) as [number, number];
  const name = monthName(year, month);
  return `${year === Number(today.slice(0, 4)) ? name : `${name} ${String(year)}`}, no day yet`;
}

function nowBlock(input: TurnBlockInput, sheetOf: (packageId: string | null) => TripSheet | undefined): string {
  const { today, timeZone, facts, cameFrom } = input;
  const ad = cameFrom === null ? undefined : sheetOf(cameFrom.packageId);
  const sent = facts.sentTripIds.flatMap((id) => sheetOf(id)?.label ?? []).map((label) => `${label} brochure`);
  const tasks = input.lead.openTasks.map((task) => oneLine(cutText(task, TASK_CUT)).replace(/[.\s]+$/u, ""));
  return [
    `<now>${formatShortDay(today, today)} ${today.slice(0, 4)}, ${clockWords(input.now, timeZone)}, the customer's time ` +
      `(${timeZone}). Follow-ups go out ${hourWords(WAKING_HOURS.from)} to ${hourWords(WAKING_HOURS.until)}.`,
    [
      cameFrom === null
        ? null
        : `Came from: ${oneLine(cameFrom.source)}${ad === undefined ? "" : ` for ${ad.label} ${fenced(ad.title)}`}.`,
      `Sent: ${sent.length === 0 ? "none" : sent.join(", ")}.`,
      `Live offer: ${facts.offer === null ? "none" : offerWords(facts.offer, input, sheetOf)}.`,
      `Open tasks: ${tasks.length === 0 ? "none" : tasks.join("; ")}.</now>`,
    ]
      .filter(isText)
      .join(" "),
  ].join("\n");
}

function offerWords(
  offer: LiveOffer,
  clock: Pick<TurnBlockInput, "today" | "timeZone">,
  sheetOf: (packageId: string | null) => TripSheet | undefined,
): string {
  return [
    sheetOf(offer.packageId)?.label ?? "a trip not on sale now",
    formatShortDay(parseCalendarDate(offer.startsOn), clock.today),
    partyWords(offer.adults, offer.childrenAges),
    offer.room === null ? null : roomNames[offer.room],
    offer.payInFull ? "paying in full" : null,
    `total ${formatRupees(offer.totalPaise)}`,
    `advance ${formatRupees(offer.advancePaise)}`,
    `made ${stampOf(new Date(offer.at), clock)}`,
  ]
    .filter(isText)
    .join(", ");
}

function leadBlock(input: TurnBlockInput, sheetOf: (packageId: string | null) => TripSheet | undefined): string {
  const { lead, today, timeZone } = input;
  const name =
    lead.name.trim() === ""
      ? "No name yet"
      : `${oneLine(lead.name)}${lead.cameFrom === "" ? "" : ` (${oneLine(lead.cameFrom)})`}`;
  const trip = sheetOf(lead.packageId);
  const notes = [...lead.teamNotes]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map(
      (note) =>
        `${formatShortDay(calendarDateIn(note.at, timeZone), today)}, ${oneLine(note.by)}: ` +
        `"${oneLine(cutText(note.text, NOTE_CUT))}"`,
    );
  const lines = [
    [
      name,
      trip === undefined ? null : `trip ${trip.label}`,
      whenWords(lead, today),
      partyWords(lead.adults, lead.childrenAges),
      lead.pickupCity === null ? null : `joining from ${oneLine(lead.pickupCity)}`,
      lead.room === null ? null : `${roomNames[lead.room]} room`,
      `stage ${stageLabel(lead.stage)}`,
    ]
      .filter(isText)
      .join(" · "),
    lead.summary === null || lead.summary.trim() === ""
      ? null
      : `Summary: ${oneLine(cutText(lead.summary, SUMMARY_CUT))}`,
    notes.length === 0 ? null : `Team notes, newest first: ${notes.join("; ")}`,
  ].filter(isText);
  return `<lead>${lines.join("\n")}</lead>`;
}

/** The lead's trip, the ad's, then those the new lines name (`findPackages`' whole-word matches), 3 at most. */
function focusTrips(input: TurnBlockInput): TripSheet[] {
  const index = input.sheets.map(({ packageId, title, place, nights, startCity }) => ({
    id: packageId,
    title,
    place,
    destinationId: null,
    nights,
    startCity,
  }));
  const named = findPackages(index, input.newLines.map((line) => line.text).join("\n")).exact.map((entry) => entry.id);
  const wanted = new Set([input.lead.packageId, input.cameFrom?.packageId ?? null, ...named]);
  return [...wanted]
    .flatMap((id) => input.sheets.find((sheet) => sheet.packageId === id) ?? [])
    .slice(0, MOST_FOCUS_TRIPS);
}

const withTrips = (head: string, trips: readonly string[], tail: string) =>
  trips.length === 0
    ? `${head}\n${tail}`
    : `${head}\nTrips this chat is about, in full:\n\n${trips.join("\n\n")}\n\n${tail}`;

export function turnBlock(input: TurnBlockInput): string {
  const sheetOf = (packageId: string | null) => input.sheets.find((sheet) => sheet.packageId === packageId);
  const head = `${nowBlock(input, sheetOf)}\n${leadBlock(input, sheetOf)}`;
  const tail = [input.notice, "New messages:", ...input.newLines.map((line) => customerLine(line, input))]
    .filter(isText)
    .join("\n");
  // A trip that doesn't fit what the rest leaves is left out: its index line is in the agency block, and get_trip reads it.
  let trips: string[] = [];
  for (const sheet of input.indexed ? focusTrips(input) : []) {
    const tried = [...trips, fenced(tripInFull(sheet, input.today))];
    if (estimateTokens(withTrips(head, tried, tail)) <= NATURAL_BUDGETS.turn) trips = tried;
  }
  return withTrips(head, trips, tail);
}
