// The words of the turn block (spec 4.4) the one agent and the chat summary reuse: the lead, its live offer, its dates
// and the team's notes, and the trips the customer's words name.
import type { LiveOffer, NaturalFacts } from "@travel-crm/contracts/ai";
import { calendarMonth } from "@travel-crm/contracts/crm";
import {
  calendarDateIn,
  formatRupees,
  formatShortDay,
  parseCalendarDate,
  type CalendarDate,
} from "../../../kernel/index.js";
import { fenced } from "../../fenced.js";
import { oneLine } from "../../lite/context/blocks.js";
import { stageLabel, travellerWords } from "../../lite/context/lead-card.js";
import { findPackages, meaningful } from "../../lite/lookups/find-packages.js";
import { indexEntryOf } from "../trips/trip-sheets.js";
import { isText, roomNames } from "../trips/trip-text.js";
import type { NaturalChatLine, NaturalLeadView, TripSheet } from "../types.js";
import { stampOf } from "./chat-turns.js";
import { cutText } from "./tokens.js";

const SUMMARY_CUT = 600;
const NOTE_CUT = 300;
/**
 * Words that never name one trip, past those lite's `meaningful` drops: a kind of trip ("trek"), a trip's length and the
 * thing asked for ("days", "brochure": titles like "Chopta (4 days)" hold them, and "1 days ka brochure" pulled in every
 * such trip, live on 2026-11-24), and words that only join others in English or Hinglish ("of", "in", "ka", "mein"),
 * which titles like "Valley of Flowers" hold too.
 */
const NAMES_NO_TRIP = new Set([
  ...["trek", "treks", "trip", "trips", "tour", "tours", "package", "packages", "yatra"],
  ...["day", "days", "night", "nights", "din", "brochure", "brochures", "itinerary", "pdf", "details", "detail"],
  ...["a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with", "by", "from", "is", "are", "this", "that"],
  ...["ka", "ki", "ke", "ko", "se", "me", "mein", "par", "pe", "aur", "ya", "wala", "wali", "wale", "hai", "hain"],
]);

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

const monthName = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

export function whenWords(lead: NaturalLeadView, today: CalendarDate): string | null {
  if (lead.day !== null) return formatShortDay(lead.day, today);
  if (lead.month === null) return null;
  if (!calendarMonth.safeParse(lead.month).success) return oneLine(lead.month);
  const [year, month] = lead.month.split("-").map(Number) as [number, number];
  const name = monthName(year, month);
  return `${year === Number(today.slice(0, 4)) ? name : `${name} ${String(year)}`}, no day yet`;
}

/** The trip by name, its ID after it as the tools' handle; the offer's trip may be off sale now. */
const tripOf = (sheet: TripSheet | undefined) =>
  sheet === undefined ? "a trip not on sale now" : `${fenced(sheet.title)} (ID ${sheet.label})`;

export function offerWords(
  offer: LiveOffer,
  clock: Pick<TurnBlockInput, "today" | "timeZone">,
  sheetOf: (packageId: string | null) => TripSheet | undefined,
): string {
  return [
    tripOf(sheetOf(offer.packageId)),
    formatShortDay(parseCalendarDate(offer.startsOn), clock.today),
    travellerWords(offer.adults, offer.childrenAges),
    offer.room === null ? null : roomNames[offer.room],
    offer.payInFull ? "paying in full" : null,
    `total ${formatRupees(offer.totalPaise)}`,
    `advance ${formatRupees(offer.advancePaise)}`,
    `made ${stampOf(new Date(offer.at), clock)}`,
  ]
    .filter(isText)
    .join(", ");
}

export function leadBlock(
  input: Pick<TurnBlockInput, "lead" | "today" | "timeZone">,
  sheetOf: (packageId: string | null) => TripSheet | undefined,
): string {
  const { lead, today, timeZone } = input;
  const name =
    lead.name.trim() === ""
      ? "No name yet"
      : `${oneLine(lead.name)}${lead.cameFrom === "" ? "" : ` (${oneLine(lead.cameFrom)})`}`;
  const trip = sheetOf(lead.packageId);
  const lines = [
    [
      name,
      trip === undefined ? null : `trip ${trip.label}`,
      whenWords(lead, today),
      travellerWords(lead.adults, lead.childrenAges),
      lead.pickupCity === null ? null : `joining from ${oneLine(lead.pickupCity)}`,
      lead.room === null ? null : `${roomNames[lead.room]} room`,
      `stage ${stageLabel(lead.stage)}`,
    ]
      .filter(isText)
      .join(" · "),
    lead.summary === null || lead.summary.trim() === ""
      ? null
      : `Summary: ${oneLine(cutText(lead.summary, SUMMARY_CUT))}`,
    teamNotesLine(lead, today, timeZone),
  ].filter(isText);
  return `<lead>${lines.join("\n")}</lead>`;
}

/** "Team notes, newest first: …", each note cut to its budget, or null with none. */
export function teamNotesLine(lead: NaturalLeadView, today: CalendarDate, timeZone: string): string | null {
  const notes = [...lead.teamNotes]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .map(
      (note) =>
        `${formatShortDay(calendarDateIn(note.at, timeZone), today)}, ${oneLine(note.by)}: ` +
        `"${oneLine(cutText(note.text, NOTE_CUT))}"`,
    );
  return notes.length === 0 ? null : `Team notes, newest first: ${notes.join("; ")}`;
}

/**
 * The trips a text names, by package id in the sheets' order (the focus trips here, G6 for a brochure): each word that
 * may name a trip is matched as `findPackages` matches it (whole words of the title and place), and only the trips
 * matching the most of them count, so "Har Ki Dun trek" names Har Ki Dun alone.
 */
export function namedTrips(sheets: readonly TripSheet[], text: string): string[] {
  const index = sheets.map(indexEntryOf);
  const asked = new Set(meaningful(text).filter((word) => !NAMES_NO_TRIP.has(word)));
  const matched = new Map<string, number>();
  for (const word of asked)
    for (const entry of findPackages(index, word, { most: index.length }).exact)
      matched.set(entry.id, (matched.get(entry.id) ?? 0) + 1);
  const most = Math.max(0, ...matched.values());
  return index.filter((entry) => matched.get(entry.id) === most).map((entry) => entry.id);
}
