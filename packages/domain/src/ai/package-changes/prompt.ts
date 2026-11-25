// What the AI change assistant asks the model: the prompt from Langfuse (package-changes/system, label production) or
// the built-in text, then the trip as it is and what the agency gave, each fenced as data; and the call itself, traced
// as one turn linked to the Langfuse prompt it ran.
import type { AiMessage, AiModel, AiPart, AiResult } from "@travel-crm/integrations/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import type { AiTracing } from "@travel-crm/integrations/tracing";
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
  /** The questions the answers reply to, by the answer's ref. */
  asked: readonly [string, string][];
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
    ...(request.asked.length === 0
      ? []
      : [
          `The questions you asked before, by the answer that replies:\n<data>${fenced(numbered(request.asked))}</data>`,
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

/** Who asks, about which trip, and what was attached: the trace's ids and counts. */
export interface AskContext {
  organizationId: string;
  userId: string;
  packageId: string;
  photos: number;
  pdfLines: number;
}

/**
 * The one model call. Traced (when tracing is on) as a turn of its own, linked to the Langfuse prompt it ran so the
 * generation shows that prompt's version; the built-in text is none of Langfuse's.
 */
export function askForChanges(
  model: AiModel,
  tracing: AiTracing | undefined,
  prompt: NaturalPrompt,
  messages: readonly AiMessage[],
  context: AskContext,
): Promise<AiResult> {
  // Opaque: the agency's id, never a person's.
  const call = () =>
    model.complete({ feature: "change_package", messages, json: true, maxTokens: 6000, user: context.organizationId });
  if (tracing === undefined) return call();
  const { source } = prompt;
  return tracing.turn(
    {
      name: "package-changes.propose",
      sessionId: `package-changes:${context.packageId}`,
      organizationId: context.organizationId,
      userId: context.userId,
      tags: ["package-changes"],
      ...(source === undefined ? {} : { prompt: { name: source.name, version: source.version } }),
      metadata: {
        packageId: context.packageId,
        photos: context.photos,
        pdfLines: context.pdfLines,
        promptVersion: prompt.version,
        promptLabel: source?.label ?? null,
      },
    },
    call,
  );
}
