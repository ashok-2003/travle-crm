// What the model is told when it reads travellers' details from a voice note, a typed list, a photographed list or an ID:
// fixed rules and the source as data. It is given no detail already held on the booking's rows (the matching is code's), no
// phone, no price. For an ID it copies; it never works out an age into a date, and never reads a number off an ID other than
// a passport's two machine-readable lines, which code then checks.
import type { AiMessage, AiPart } from "@travel-crm/integrations/ai";
import { FILL_TRAVELLERS_PROMPT_TEXT } from "./prompt-text.js";

export const TRAVELLERS_PROMPT_NAME = "fill-form/travellers";

/** The marker the journeys' fake model recognises this feature by. */
export const TRAVELLERS_MARKER = "FILL_TRAVELLERS";

const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");

export interface TravellersFacts {
  today: string;
  /** The typed or dictated words; empty for a recording or a photo alone. */
  text: string;
  attachments: readonly AiPart[];
}

export function travellersPrompt(
  facts: TravellersFacts,
  instructions: string = FILL_TRAVELLERS_PROMPT_TEXT,
): AiMessage[] {
  const parts = [
    `Today is ${facts.today}.`,
    facts.text === "" ? "" : `The source:\n<data>${fenced(facts.text)}</data>`,
    facts.attachments.length === 0 ? "" : "The recording or the photo is attached: it is the source.",
    "Read the travellers.",
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
