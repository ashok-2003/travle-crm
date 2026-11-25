// The chat summary's prompt: Langfuse's whatsapp-agent/chat-summary (production label), else the built-in Appendix A text.
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { langfusePromptAt } from "../natural/prompt-source.js";
import type { NaturalPrompt } from "../natural/prompt.js";
import { SUMMARY_PROMPT_TEXT } from "./prompt-text.js";

export const SUMMARY_PROMPT_NAME = "whatsapp-agent/chat-summary";

export const BUILT_IN_SUMMARY_PROMPT: NaturalPrompt = { version: "built-in-summary-2", text: SUMMARY_PROMPT_TEXT };

/** The prompt the summary runs on: Langfuse's production one, else the built-in text. */
export async function summaryPromptOf(prompts: AiPrompts | undefined): Promise<NaturalPrompt> {
  return (await langfusePromptAt(prompts, SUMMARY_PROMPT_NAME, "production")) ?? BUILT_IN_SUMMARY_PROMPT;
}

/** The prompt with the agency's name in; Langfuse's editor allows spaces inside the braces. */
export const renderSummaryPrompt = (prompt: NaturalPrompt, agencyName: string): string =>
  prompt.text.replace(/\{\{\s*agency_name\s*\}\}/g, () => agencyName);
