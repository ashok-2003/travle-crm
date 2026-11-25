// What the AI change assistant asks the model: the prompt from Langfuse (package-changes/system, label production) or
// the built-in text, then the trip as it is and what the agency gave, each fenced as data.
import type { AiMessage, AiPart } from "@travel-crm/integrations/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { formatShortDay, type CalendarDate } from "../../kernel/index.js";
import { fenced } from "../fenced.js";
import { langfusePromptAt } from "../natural/prompt-source.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import { PACKAGE_CHANGES_PROMPT_TEXT } from "./prompt-text.js";

export const PACKAGE_CHANGES_PROMPT_NAME = "package-changes/system";

export const BUILT_IN_PACKAGE_CHANGES_PROMPT: NaturalPrompt = {
  version: "built-in-package-changes-1",
  text: PACKAGE_CHANGES_PROMPT_TEXT,
};

/** The prompt the assistant runs on: Langfuse's production one, else the built-in text (Langfuse off, slow or without it). */
export async function packageChangesPromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (
    (await langfusePromptAt(prompts, PACKAGE_CHANGES_PROMPT_NAME, "production")) ?? BUILT_IN_PACKAGE_CHANGES_PROMPT
  );
}

export interface ChangesRequest {
  prompt: NaturalPrompt;
  today: CalendarDate;
  tripText: string;
  message: readonly [string, string][];
  pdf: readonly [string, string][];
  answers: readonly [string, string][];
  photos: readonly AiPart[];
}

const numbered = (lines: readonly [string, string][]) => lines.map(([ref, text]) => `${ref} ${text}`).join("\n");

export function changesMessages(request: ChangesRequest): AiMessage[] {
  const parts = [
    `Today is ${formatShortDay(request.today, request.today)} ${request.today.slice(0, 4)}.`,
    `The trip now:\n<data>${fenced(request.tripText)}</data>`,
    request.message.length === 0
      ? "The agency pasted no message."
      : `What the agency pasted:\n<data>${fenced(numbered(request.message))}</data>`,
    ...(request.pdf.length === 0 ? [] : [`The attached PDF's lines:\n<data>${fenced(numbered(request.pdf))}</data>`]),
    ...(request.photos.length === 0
      ? []
      : [
          `${String(request.photos.length)} photo(s) attached, in order: P1${request.photos.length > 1 ? ` to P${String(request.photos.length)}` : ""}.`,
        ]),
    ...(request.answers.length === 0
      ? []
      : [`The agency's answers to your questions:\n<data>${fenced(numbered(request.answers))}</data>`]),
    "Propose the changes to this trip.",
  ];
  return [
    { role: "system", content: request.prompt.text },
    {
      role: "user",
      content: parts.join("\n\n"),
      ...(request.photos.length === 0 ? {} : { attachments: request.photos }),
    },
  ];
}
