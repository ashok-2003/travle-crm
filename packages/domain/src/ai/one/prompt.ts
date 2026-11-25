// The one agent's prompt: Langfuse's whatsapp-agent/real-agent (its production label, for live turns and Try it),
// with the built-in v2 text standing in when Langfuse is off, has no such prompt, or can't answer in time.
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { langfusePromptAt } from "../natural/prompt-source.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import { ONE_PROMPT_TEXT } from "./prompt-text.js";

export const ONE_PROMPT_NAME = "whatsapp-agent/real-agent";
export const onePromptLabels = { live: "production" } as const;

export const BUILT_IN_ONE_PROMPT: NaturalPrompt = { version: "built-in-one-5", text: ONE_PROMPT_TEXT };

/** The prompt live turns and Try it run on: Langfuse's production one, else the built-in text. */
export async function onePromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (await langfusePromptAt(prompts, ONE_PROMPT_NAME, onePromptLabels.live)) ?? BUILT_IN_ONE_PROMPT;
}
