// What the model is told when it drafts a quote's day-by-day plan: fixed rules, the trip as code knows it, the agency's own plans
// for the place (to adapt, not copy blindly), as data. No price, no amount, no phone: a budget is only a tone.
import type { WriteStyle } from "@travel-crm/contracts/ai";
import type { AiMessage } from "@travel-crm/integrations/ai";
import { DRAFT_DAYS_PROMPT_TEXT } from "./prompt-text.js";

export const DRAFT_DAYS_PROMPT_NAME = "draft-days/system";

/** The marker the journeys' fake model recognises this feature by. */
export const DRAFT_DAYS_MARKER = "DRAFT_DAYS";

const STYLES: Record<WriteStyle, string> = {
  warm: "Warm and friendly.",
  premium: "Polished and refined.",
  short: "As short as possible.",
};

export interface DraftFacts {
  destination: string | null;
  dayCount: number;
  month: string | null;
  adults: number | null;
  childrenAges: readonly number[];
  tripType: string | null;
  hotelCategory: string | null;
  food: string | null;
  roomType: string | null;
  departureCity: string | null;
  /** The lead has a budget: a tone only, the amount is never given. */
  budgetConscious: boolean;
  /** The quotation's lines, described, never priced. */
  items: readonly string[];
  packages: readonly { name: string; nights: number | null; days: readonly { title: string; description: string }[] }[];
  writeStyle: string;
  /** What staff said they want ("relaxed, no long drives, one day free"). */
  note: string;
}

const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");

export function draftDaysPrompt(facts: DraftFacts, instructions: string = DRAFT_DAYS_PROMPT_TEXT): AiMessage[] {
  const trip = [
    `Days: ${String(facts.dayCount)}`,
    facts.destination === null ? "Place: not set" : `Place: ${facts.destination}`,
    facts.month === null ? "" : `Month: ${facts.month}`,
    facts.adults === null ? "" : `Adults: ${String(facts.adults)}`,
    facts.childrenAges.length === 0 ? "" : `Children's ages: ${facts.childrenAges.join(", ")}`,
    facts.tripType === null ? "" : `Trip type: ${facts.tripType}`,
    facts.hotelCategory === null ? "" : `Hotel category: ${facts.hotelCategory}`,
    facts.food === null ? "" : `Food: ${facts.food}`,
    facts.roomType === null ? "" : `Room type: ${facts.roomType}`,
    facts.departureCity === null ? "" : `Starting from: ${facts.departureCity}`,
    facts.budgetConscious ? "The customer has a budget in mind: be sensible, not lavish." : "",
  ].filter((line) => line !== "");
  const style = facts.writeStyle === "premium" || facts.writeStyle === "short" ? facts.writeStyle : "warm";
  const parts = [
    `The trip:\n<data>${fenced(trip.join("\n"))}</data>`,
    facts.items.length === 0 ? "" : `The quotation's lines:\n<data>${fenced(facts.items.join("\n"))}</data>`,
    facts.packages.length === 0
      ? ""
      : `The agency's own plans for this place:\n<data>${fenced(
          facts.packages
            .map(
              (one) =>
                `## ${one.name}${one.nights === null ? "" : ` (${String(one.nights)} nights)`}\n${one.days
                  .map((day, index) => `Day ${String(index + 1)}: ${day.title}. ${day.description}`)
                  .join("\n")}`,
            )
            .join("\n\n"),
        )}</data>`,
    facts.note === "" ? "" : `What the staff member asked for:\n<data>${fenced(facts.note)}</data>`,
    `Style: ${STYLES[style]}`,
    `Language: English (simple, as an Indian travel agent would write it).`,
    `Write ${String(facts.dayCount)} days.`,
  ].filter((part) => part !== "");
  return [
    { role: "system", content: instructions },
    { role: "user", content: parts.join("\n\n") },
  ];
}
