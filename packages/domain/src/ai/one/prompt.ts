// The one agent's prompt: Langfuse's whatsapp-agent/real-agent (its production label, for live turns and Try it; Try it
// may run its draft label instead), with the built-in text standing in when Langfuse is off, has no such prompt, or
// can't answer in time.
import { onePromptLabels, type OneTestPrompt } from "@travel-crm/contracts/ai";
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { langfusePromptAt } from "../natural/prompt-source.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import { ONE_PROMPT_TEXT } from "./prompt-text.js";

export const ONE_PROMPT_NAME = "whatsapp-agent/real-agent";

export const BUILT_IN_ONE_PROMPT: NaturalPrompt = { version: "built-in-one-9", text: ONE_PROMPT_TEXT };

/** The prompt live turns and Try it run on: Langfuse's production one, else the built-in text. */
export async function onePromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (await langfusePromptAt(prompts, ONE_PROMPT_NAME, onePromptLabels.live)) ?? BUILT_IN_ONE_PROMPT;
}

/**
 * Try it's prompt: the live one, or the draft. The draft is read past the cache, so an edit in Langfuse shows on the next
 * turn; with no draft to read, the turn runs on the live prompt, and its trace's label says so. The two are read at once,
 * so a slow Langfuse costs the turn one wait (the port's bound), never two.
 */
export async function oneTryItPrompt(prompts: AiPrompts | undefined, chosen: OneTestPrompt): Promise<NaturalPrompt> {
  if (chosen === "live") return onePromptOf(prompts);
  const [draft, live] = await Promise.all([
    langfusePromptAt(prompts, ONE_PROMPT_NAME, onePromptLabels.draft, { fresh: true }),
    onePromptOf(prompts),
  ]);
  return draft ?? live;
}
