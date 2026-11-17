// The one agent's prompt: Langfuse's whatsapp-agent/real-agent (production label for live turns, latest for Try it),
// with the built-in v2 text standing in when Langfuse is off, has no such prompt, or can't answer in time.
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { langfusePromptAt } from "../natural/prompt-source.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import { ONE_PROMPT_TEXT } from "./prompt-text.js";

export const ONE_PROMPT_NAME = "whatsapp-agent/real-agent";
export const onePromptLabels = { live: "production", tryIt: "latest" } as const;

export const BUILT_IN_ONE_PROMPT: NaturalPrompt = { version: "built-in-one-3", text: ONE_PROMPT_TEXT };

/** The prompt live turns run on: Langfuse's production one, else the built-in text. */
export async function onePromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (await langfusePromptAt(prompts, ONE_PROMPT_NAME, onePromptLabels.live)) ?? BUILT_IN_ONE_PROMPT;
}

/** Try it's prompt: the latest version, read past the cache so an edit shows on the next turn, else the built-in text. */
export async function oneTryItPrompt(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (
    (await langfusePromptAt(prompts, ONE_PROMPT_NAME, onePromptLabels.tryIt, { fresh: true })) ?? BUILT_IN_ONE_PROMPT
  );
}
