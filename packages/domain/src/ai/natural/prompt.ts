// The agent's prompt as a turn holds it, and filling in its placeholders for one agency. They are written as Langfuse
// writes variables, {{agent_name}}, so the built-in text and Langfuse's prompt are one template.

export interface NaturalPrompt {
  /** "built-in-1", or Langfuse's "langfuse:<name>@<version>". */
  version: string;
  text: string;
  /** Where Langfuse keeps it, when it came from there: the turn's model calls are linked to it. */
  source?: { name: string; version: number; label: string };
}
/** The agency picks no tone (the owner, 2026-11-27): the prompt's rules and examples set how the agent writes. */
export interface AgentVoice {
  agentName: string;
  agencyName: string;
}
export const NATURAL_PROMPT_PLACEHOLDERS = ["agent_name", "agency_name"] as const;

/** A placeholder as Langfuse writes it, with the spaces its editor allows inside the braces. */
const PLACEHOLDER = /\{\{\s*(agent_name|agency_name)\s*\}\}/g;

// With no agent name the agent is introduced as the agency's team.
export function renderNaturalPrompt(prompt: NaturalPrompt, voice: AgentVoice): string {
  const values: Record<(typeof NATURAL_PROMPT_PLACEHOLDERS)[number], string> = {
    agent_name: voice.agentName.trim() === "" ? `the ${voice.agencyName} team` : voice.agentName,
    agency_name: voice.agencyName,
  };
  return prompt.text.replace(PLACEHOLDER, (_match, key: keyof typeof values) => values[key]);
}
