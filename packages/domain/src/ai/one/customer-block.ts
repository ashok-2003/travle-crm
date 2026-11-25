// The one agent's notes at the start of the chat (the owner, 2026-11-24): a <customer> block of what is saved and what
// is pending, with their trip in full, then the chat summary, each tagged. Every call carries them, since the model keeps
// nothing between calls, and at the start the provider caches them while they hold; the turn's message keeps only the
// new words. No name, stage or follow-up hours: the owner found them noise.
import type { NaturalFacts } from "@travel-crm/contracts/ai";
import type { CalendarDate } from "../../kernel/index.js";
import { fenced } from "../fenced.js";
import { oneLine } from "../lite/context/blocks.js";
import { travellerWords } from "../lite/context/lead-card.js";
import { cutText } from "../natural/context/tokens.js";
import { offerWords, teamNotesLine, whenWords } from "../natural/context/turn-block.js";
import { sentBrochuresLine } from "../natural/trips/brochures.js";
import { isText, roomNames, tripInFull } from "../natural/trips/trip-text.js";
import type { NaturalLeadView, TripSheet } from "../natural/types.js";

const EARLIER_NOTES_CUT = 600;
const TASK_CUT = 200;

export interface CustomerBlockInput {
  lead: NaturalLeadView;
  facts: NaturalFacts;
  cameFrom: { source: string; packageId: string | null } | null;
  sheets: readonly TripSheet[];
  /** True when the system message lists the trips in short: their trip is then given here in full. */
  indexed: boolean;
  today: CalendarDate;
  timeZone: string;
}

/** What is saved on the customer and what is pending, a line each only when there is something; null with nothing. */
export function customerBlock(input: CustomerBlockInput): string | null {
  const { lead, facts, cameFrom, today, timeZone } = input;
  const sheetOf = (packageId: string | null) => input.sheets.find((sheet) => sheet.packageId === packageId);
  const trip = sheetOf(lead.packageId);
  const ad = cameFrom === null ? undefined : sheetOf(cameFrom.packageId);
  const details = [
    trip === undefined ? null : `trip ${trip.label}`,
    whenWords(lead, today),
    travellerWords(lead.adults, lead.childrenAges),
    lead.pickupCity === null ? null : `joining from ${oneLine(lead.pickupCity)}`,
    lead.room === null ? null : `${roomNames[lead.room]} room`,
  ].filter(isText);
  const tasks = lead.openTasks.map((task) => oneLine(cutText(task.text, TASK_CUT)).replace(/[.\s]+$/u, ""));
  // Only the trip they are on (else the ad's): any other the model looks up, and words never pick one (owner, 2026-11-24).
  const theirs = input.indexed ? (trip ?? ad) : undefined;
  const lines = [
    details.length === 0 ? null : `Details: ${details.join(" · ")}`,
    cameFrom === null
      ? null
      : `Came from: ${oneLine(cameFrom.source)}${ad === undefined ? "" : ` for ${ad.label} ${fenced(ad.title)}`}.`,
    lead.summary === null || lead.summary.trim() === ""
      ? null
      : `Earlier notes: ${oneLine(cutText(lead.summary, EARLIER_NOTES_CUT))}`,
    teamNotesLine(lead, today, timeZone),
    sentBrochuresLine(input.sheets, facts.sentFileIds),
    facts.offer === null ? null : `Live offer: ${offerWords(facts.offer, { today, timeZone }, sheetOf)}.`,
    tasks.length === 0 ? null : `Open tasks: ${tasks.join("; ")}.`,
    theirs === undefined ? null : `\nTheir trip:\n${fenced(tripInFull(theirs, today))}`,
  ].filter(isText);
  return lines.length === 0 ? null : `<customer>\n${lines.join("\n")}\n</customer>`;
}

/** The chat's first message: the customer's block, then the summary, each tagged; null with neither. */
export function openingNotes(customer: string | null, summary: string | null): string | null {
  const parts = [
    customer,
    summary === null || summary.trim() === "" ? null : `<chat_summary>\n${fenced(summary.trim())}\n</chat_summary>`,
  ].filter(isText);
  return parts.length === 0 ? null : parts.join("\n");
}
