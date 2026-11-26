// What the model is told when it fills a form: fixed rules, the keys it may fill for the target (and none for money), today's
// date, and the source as data. The words of a customer or a pasted chat are fenced as data, so an instruction inside is
// not one. The agency's name, the person's contacts held elsewhere and the rest of the lead are not included.
import type { FillTarget } from "@travel-crm/contracts/ai";
import type { AiMessage, AiPart } from "@travel-crm/integrations/ai";
import { FILL_FORM_PROMPT_TEXT } from "./prompt-text.js";

export const FILL_FORM_PROMPT_NAME = "fill-form/system";

/** The marker the journeys' fake model recognises a fill by. */
export const FILL_FORM_MARKER = "FILL_FORM";

const TRIP_KEYS = `"destination": the place, "dateFrom" and "dateTo": the first and last day as said, "month": a month as said when only that is known, "flexible": true when they say dates are flexible, "adults": number, "childrenAges": [numbers] only when ages are said, "childrenCount": number, "budget": the amount as said, "budgetBasis": "per_person" or "for_everyone", "departureCity", "tripType": one of family, honeymoon, friends, solo, corporate, pilgrimage, trek, "hotelCategory": one of 3_star, 4_star, 5_star, any, "food": one of veg, jain, non_veg, "roomType"`;

/** The targets whose keys are a plain form's: Draft the days and the travellers have prompts of their own. */
export type PlainFillTarget = Exclude<FillTarget, "quote_days" | "travellers">;

const KEYS: Record<PlainFillTarget, string> = {
  lead: `A new lead. Keys: "name", "phone", "phone2" (a second number), "email", "instagram", ${TRIP_KEYS}, "note": other useful facts from the source in one or two plain sentences, "excerpts", "questions".`,
  lead_edit: `Changes to a lead's trip. Keys: ${TRIP_KEYS}, "excerpts", "questions".`,
  call_note: `What was said after a call with a customer. Keys: "outcome": one of spoke, no_answer, busy, wrong_number, "note": the call written up cleanly in the speaker's own language, up to 2000 characters, "followUpDay" and "followUpTime" as said and "followUpTitle": a short title, only if a follow-up was asked for; and, only if the call mentioned them, the trip keys ${TRIP_KEYS}; "excerpts", "questions".`,
  quote: `A quotation's text. Keys: "title", "startDate" as said, "adults", "children", "days": [{"title", "description"}] one per day of the plan, "items": [{"description", "detail", "quantity"}] the things being sold, with NO price, "inclusions", "exclusions", "notes", "excerpts", "questions".`,
};

const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");

export interface FillSourceFacts {
  /** Today in the organization's zone, yyyy-mm-dd, and its weekday. */
  today: string;
  weekday: string;
  /** The typed, dictated or pasted words; empty for a recording alone. */
  text: string;
  /** A chat's lines, oldest first. */
  chat: readonly { fromCustomer: boolean; text: string }[];
  attachments: readonly AiPart[];
}

/** `instructions` is the system message: Langfuse's text when the caller read one, else the built-in text. */
export function fillPrompt(
  target: PlainFillTarget,
  facts: FillSourceFacts,
  instructions: string = FILL_FORM_PROMPT_TEXT,
): AiMessage[] {
  const parts = [
    `Today is ${facts.weekday} ${facts.today}.`,
    KEYS[target],
    facts.text === "" ? "" : `The source:\n<data>${fenced(facts.text)}</data>`,
    facts.chat.length === 0
      ? ""
      : `The chat, oldest first:\n<data>${fenced(facts.chat.map((line) => `${line.fromCustomer ? "Customer" : "Agency"}: ${line.text.slice(0, 500)}`).join("\n"))}</data>`,
    facts.attachments.length === 0 ? "" : "The recording or the screenshot is attached: it is the source.",
    "Fill the form.",
  ].filter((part) => part !== "");
  return [
    { role: "system", content: instructions },
    {
      role: "user",
      content: parts.join("\n\n"),
      ...(facts.attachments.length === 0 ? {} : { attachments: facts.attachments }),
    },
  ];
}
