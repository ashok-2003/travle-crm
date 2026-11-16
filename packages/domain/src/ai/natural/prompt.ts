// The natural agent's prompt: the built-in text, its placeholders, and filling them in for one agency. The placeholders
// are written as Langfuse writes variables, {{agent_name}}, so the built-in text and Langfuse's prompt are one template.
import { NATURAL_PROMPT_TEXT } from "./prompt-text.js";

export interface NaturalPrompt {
  /** "built-in-1", or Langfuse's "langfuse:<name>@<version>". */
  version: string;
  text: string;
  /** Where Langfuse keeps it, when it came from there: the turn's model calls are linked to it. */
  source?: { name: string; version: number; label: string };
}
export interface AgentVoice {
  agentName: string;
  agencyName: string;
  tone: "friendly" | "professional";
}

export const BUILT_IN_NATURAL_PROMPT: NaturalPrompt = { version: "built-in-1", text: NATURAL_PROMPT_TEXT };
export const NATURAL_PROMPT_PLACEHOLDERS = ["agent_name", "agency_name", "tone"] as const;

/** A placeholder as Langfuse writes it, with the spaces its editor allows inside the braces. */
const PLACEHOLDER = /\{\{\s*(agent_name|agency_name|tone)\s*\}\}/g;

// With no agent name the agent is introduced as the agency's team.
export function renderNaturalPrompt(prompt: NaturalPrompt, voice: AgentVoice): string {
  const values: Record<(typeof NATURAL_PROMPT_PLACEHOLDERS)[number], string> = {
    agent_name: voice.agentName.trim() === "" ? `the ${voice.agencyName} team` : voice.agentName,
    agency_name: voice.agencyName,
    tone: voice.tone,
  };
  return prompt.text.replace(PLACEHOLDER, (_match, key: keyof typeof values) => values[key]);
}
