// What the AI is told when it reads a supplier's rate sheet: fixed rules, then the sheet's numbered lines (or its photos) fenced as
// data. It copies what is printed; it never adds, converts or works out a price, and what it can't tell is left empty or asked.
// The price comes back exactly as printed, and code makes it paise and checks its digits are in the line it names.
import { rateMealPlans, rateOccupancies, rateUnits } from "@travel-crm/contracts/suppliers";
import { RATE_SHEET_ROWS_MAX, RATE_SHEET_SEASONS_MAX } from "@travel-crm/contracts/ai";
import type { AiMessage, AiPart } from "@travel-crm/integrations/ai";
import { filled } from "../managed-prompt.js";
import { RATE_SHEET_PROMPT_TEXT } from "./prompt-text.js";
import type { SheetPart } from "./source.js";

export const RATE_SHEET_PROMPT_NAME = "rate-sheets/read";

const quoted = (words: readonly string[]) => words.map((one) => `"${one}"`).join(", ");

/** The rules with the contracts' lists and limits filled in: Langfuse's text, or the built-in one. */
export const rateSheetInstructions = (text: string = RATE_SHEET_PROMPT_TEXT) =>
  filled(text, {
    meal_plans: quoted(rateMealPlans),
    occupancies: quoted(rateOccupancies),
    units: quoted(rateUnits),
    max_rates: String(RATE_SHEET_ROWS_MAX),
    max_seasons: String(RATE_SHEET_SEASONS_MAX),
  });

const fenced = (text: string) => text.replaceAll("<", "‹").replaceAll(">", "›");

export function rateSheetPrompt(
  source: { part: SheetPart } | { photos: readonly AiPart[] },
  instructions: string = rateSheetInstructions(),
): AiMessage[] {
  if ("part" in source) {
    const lines = source.part.lines.map((line) => `${line.token} [${line.source}] ${line.text}`).join("\n");
    return [
      { role: "system", content: instructions },
      { role: "user", content: `The sheet:\n<data>${fenced(lines)}</data>\n\nCopy its rates.` },
    ];
  }
  return [
    { role: "system", content: instructions },
    {
      role: "user",
      content: `The photos of the sheet are attached, in order (photo 1 first). Copy its rates.`,
      attachments: source.photos,
    },
  ];
}
