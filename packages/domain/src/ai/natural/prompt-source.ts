// Reading a prompt from Langfuse's prompt management at a label (the port bounds the wait and never throws); with none
// to read, the caller runs on its built-in text.
import type { AiPrompts, PromptRequest } from "@travel-crm/integrations/prompts";
import type { NaturalPrompt } from "./prompt.js";

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
