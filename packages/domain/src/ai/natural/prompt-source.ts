// Where the natural agent's prompt comes from: Langfuse's prompt management keeps it as the text prompt
// "whatsapp-agent/natural-system", label production live and label draft for Try it; the built-in text stands in whenever
// Langfuse is off, has no such prompt, or can't answer in time (the port bounds the wait and never throws).
import { naturalPromptLabels, type NaturalTestPrompt } from "@travel-crm/contracts/ai";
import type { AiPrompts, PromptRequest } from "@travel-crm/integrations/prompts";
import { BUILT_IN_NATURAL_PROMPT, type NaturalPrompt } from "./prompt.js";

export const NATURAL_PROMPT_NAME = "whatsapp-agent/natural-system";

/** Langfuse's prompt at `label`, or null when Langfuse has none to give (or is off: no prompts at all). */
export async function naturalPromptAt(
  prompts: AiPrompts | undefined,
  label: string,
  request: PromptRequest = {},
): Promise<NaturalPrompt | null> {
  if (prompts === undefined) return null;
  let found;
  try {
    found = await prompts.textPrompt(NATURAL_PROMPT_NAME, label, request);
  } catch {
    // The port never throws; if one did, the agent still answers on its own text.
    return null;
  }
  if (found === null) return null;
  return {
    version: `langfuse:${found.name}@${String(found.version)}`,
    text: found.text,
    source: { name: found.name, version: found.version, label: found.label },
  };
}

/** The prompt the agent runs on: Langfuse's live one, else the built-in text. */
export async function naturalPromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (await naturalPromptAt(prompts, naturalPromptLabels.live)) ?? BUILT_IN_NATURAL_PROMPT;
}

/**
 * Try it's prompt: the live one, or the draft. The draft is read past the cache, so an edit in Langfuse shows on the next
 * turn; with no draft to read, the turn runs on the live prompt, and its trace's label says so.
 */
export async function naturalTryItPrompt(
  prompts: AiPrompts | undefined,
  chosen: NaturalTestPrompt,
): Promise<NaturalPrompt> {
  if (chosen === "draft") {
    const draft = await naturalPromptAt(prompts, naturalPromptLabels.draft, { fresh: true });
    if (draft !== null) return draft;
  }
  return naturalPromptOf(prompts);
}
