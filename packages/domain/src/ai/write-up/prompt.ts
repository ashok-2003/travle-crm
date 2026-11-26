// What the AI is told when it writes a quote up for the customer: fixed rules, the agency's own words, and the quote's plan
// with no unit prices. The totals are tokens for plain code to fill. The quote's and the agency's words are fenced as data.
import type { WriteStyle } from "@travel-crm/contracts/ai";
import type { AiMessage } from "@travel-crm/integrations/ai";
import { WRITE_UP_PROMPT_TEXT } from "./prompt-text.js";

/** The Langfuse prompt (label production) the write-up runs on; its built-in text is in prompt-text.ts. */
export const WRITE_UP_PROMPT_NAME = "write-up/system";

const STYLES: Record<WriteStyle, string> = {
  warm: "Warm and friendly, like a trusted travel planner.",
  premium: "Polished and refined, like a high-end travel house; courteous, never pushy.",
  short: "As short as possible: only what the customer needs to decide.",
};

export interface WriteUpFacts {
  agencyName: string;
  style: WriteStyle;
  language: "en" | "hi";
  channel: "whatsapp" | "email";
  firstName: string | null;
  quote: {
    title: string;
    startDate: string | null;
    adults: number;
    children: number;
    days: readonly { title: string; description: string }[];
    items: readonly { description: string; detail: string; quantity: number }[];
    inclusions: string;
    exclusions: string;
    notes: string;
  };
}

const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");

export function writeUpPrompt(facts: WriteUpFacts, system: string = WRITE_UP_PROMPT_TEXT): AiMessage[] {
  const { quote } = facts;
  const plan = [
    `Trip: ${quote.title}`,
    quote.startDate === null ? "" : `Starts: ${quote.startDate}`,
    `Travellers: ${String(quote.adults)} adults${quote.children > 0 ? `, ${String(quote.children)} children` : ""}`,
    ...quote.days.map((day, index) => `Day ${String(index + 1)}: ${day.title}. ${day.description}`.trim()),
    quote.items.length === 0
      ? ""
      : `Included lines: ${quote.items.map((item) => `${item.description}${item.detail === "" ? "" : ` (${item.detail})`} x${String(item.quantity)}`).join("; ")}`,
    quote.inclusions === "" ? "" : `Inclusions: ${quote.inclusions}`,
    quote.exclusions === "" ? "" : `Exclusions: ${quote.exclusions}`,
    quote.notes === "" ? "" : `Notes: ${quote.notes}`,
  ].filter((line) => line !== "");
  const parts = [
    `Agency: ${fenced(facts.agencyName)}`,
    `The quote:\n<data>${fenced(plan.join("\n"))}</data>`,
    `Customer's first name: ${facts.firstName === null ? "(unknown: greet without a name)" : fenced(facts.firstName)}`,
    `Style: ${STYLES[facts.style]}`,
    facts.language === "hi"
      ? "Language: Hindi, in Devanagari script (place and hotel names may stay in English)."
      : "Language: English.",
    facts.channel === "whatsapp"
      ? "For WhatsApp: short paragraphs, plain text, at most two or three emojis, no markdown, no headings."
      : "For email: a greeting, short sections (the plan, what is included, the price and how to book), and a sign-off from the agency. Start with a line 'Subject: ...'.",
    "Write the message about this quote.",
  ].filter((part) => part !== "");
  return [
    { role: "system", content: system },
    { role: "user", content: parts.join("\n\n") },
  ];
}
