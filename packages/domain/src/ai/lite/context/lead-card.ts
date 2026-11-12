// What the CRM already knows about the customer, as plain labelled lines: only the filled ones, no ids or column names.
import type { CalendarDate } from "../../../kernel/index.js";
import { formatShortDay } from "../../../kernel/index.js";
import { oneLine } from "./blocks.js";
import type { LeadCardFacts } from "../types.js";

const stageWords = {
  new: "New",
  contacted: "Contacted",
  quote_sent: "Quote sent",
  booking_requested: "Booking requested",
  won: "Won",
  lost: "Lost",
  not_a_lead: "Not a lead",
} as const;

export const stageLabel = (stage: string): string =>
  stage in stageWords ? stageWords[stage as keyof typeof stageWords] : stage;

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function whenWords(when: NonNullable<LeadCardFacts["when"]>, today: CalendarDate): string {
  if ("day" in when) return formatShortDay(when.day, today);
  const [year, month] = when.month.split("-");
  return `${months[Number(month) - 1] ?? String(month)} ${String(year)} (month only)`;
}

function travellerWords(adults: number | null, ages: number[]): string | null {
  const parts: string[] = [];
  if (adults !== null) parts.push(`${String(adults)} ${adults === 1 ? "adult" : "adults"}`);
  if (ages.length > 0)
    parts.push(`${String(ages.length)} ${ages.length === 1 ? "child" : "children"} (${ages.join(", ")})`);
  return parts.length === 0 ? null : parts.join(", ");
}

export function leadCardLines(card: LeadCardFacts, today: CalendarDate): string[] {
  const travellers = travellerWords(card.adults, card.childrenAges);
  const lines: [string, string | null][] = [
    ["Name", card.name === null ? null : oneLine(card.name)],
    ["Stage", card.stage === null ? null : stageLabel(card.stage)],
    ["Package", card.packageTitle === null ? null : oneLine(card.packageTitle)],
    ["Place", card.place === null ? null : oneLine(card.place)],
    ["When", card.when === null ? null : whenWords(card.when, today)],
    ["Travellers", travellers],
    ["Joining from", card.pickupCity === null ? null : oneLine(card.pickupCity)],
    ["Room", card.roomType],
  ];
  return lines
    .filter(([, value]) => value !== null && value !== "")
    .map(([label, value]) => `${label}: ${String(value)}`);
}
