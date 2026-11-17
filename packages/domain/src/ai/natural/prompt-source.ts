// Where the natural agent's prompt comes from: Langfuse's prompt management keeps it as the text prompt
// "whatsapp-agent/natural-system", label production, live and in Try it; the built-in text stands in whenever
// Langfuse is off, has no such prompt, or can't answer in time (the port bounds the wait and never throws).
import { naturalPromptLabels } from "@travel-crm/contracts/ai";
import type { AiPrompts, PromptRequest } from "@travel-crm/integrations/prompts";
import { BUILT_IN_NATURAL_PROMPT, type NaturalPrompt } from "./prompt.js";

export const NATURAL_PROMPT_NAME = "whatsapp-agent/natural-system";

/** Langfuse's prompt `name` at `label`, or null when Langfuse has none to give (or is off: no prompts at all). */
export async function langfusePromptAt(
  prompts: AiPrompts | undefined,
  name: string,
  label: string,
  request: PromptRequest = {},
): Promise<NaturalPrompt | null> {
  if (prompts === undefined) return null;
  let found;
  try {
    found = await prompts.textPrompt(name, label, request);
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

/** The natural agent's Langfuse prompt at `label`. */
export function naturalPromptAt(
  prompts: AiPrompts | undefined,
  label: string,
  request: PromptRequest = {},
): Promise<NaturalPrompt | null> {
  return langfusePromptAt(prompts, NATURAL_PROMPT_NAME, label, request);
}

/** The prompt the agent runs on: Langfuse's live one, else the built-in text. */
export async function naturalPromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (await naturalPromptAt(prompts, naturalPromptLabels.live)) ?? BUILT_IN_NATURAL_PROMPT;
}
