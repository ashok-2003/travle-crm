// A feature's instructions as the owner manages them in Langfuse (the owner, 2026-11-26: every AI prompt in one place):
// the prompt `name` at label production, else the built-in text from the code (Langfuse off, slow or without it). The
// instructions may hold {{placeholders}} the code fills; the record's data stays in the code's own messages.
import type { AiPrompts } from "@travel-crm/integrations/prompts";
import { langfusePromptAt } from "./natural/prompt-source.js";
import type { NaturalPrompt } from "./natural/prompt.js";

/** Langfuse's production `name`, else `builtIn`; only a Langfuse prompt carries a `source` (to link its calls to). */
export async function managedPrompt(
  prompts: AiPrompts | undefined,
  name: string,
  builtIn: string,
): Promise<NaturalPrompt> {
  return (await langfusePromptAt(prompts, name, "production")) ?? { version: `built-in:${name}`, text: builtIn };
}

/** Fills each {{key}} with its value in one pass; a placeholder the code has no value for is left as written. */
export function filled(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (whole, key: string) => values[key] ?? whole);
}
