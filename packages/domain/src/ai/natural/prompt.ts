// The natural agent's prompt: the built-in text, its placeholders, and filling them in for one agency.
import { NATURAL_PROMPT_TEXT } from "./prompt-text.js";

export interface NaturalPrompt {
  version: string;
  text: string;
}
export interface AgentVoice {
  agentName: string;
  agencyName: string;
  tone: "friendly" | "professional";
}

export const BUILT_IN_NATURAL_PROMPT: NaturalPrompt = { version: "built-in-1", text: NATURAL_PROMPT_TEXT };
export const NATURAL_PROMPT_PLACEHOLDERS = ["agent_name", "agency_name", "tone"] as const;

// With no agent name the agent is introduced as the agency's team.
export function renderNaturalPrompt(prompt: NaturalPrompt, voice: AgentVoice): string {
  const values: Record<(typeof NATURAL_PROMPT_PLACEHOLDERS)[number], string> = {
    agent_name: voice.agentName.trim() === "" ? `the ${voice.agencyName} team` : voice.agentName,
    agency_name: voice.agencyName,
    tone: voice.tone,
  };
  return prompt.text.replace(/\{(agent_name|agency_name|tone)\}/g, (_match, key: keyof typeof values) => values[key]);
}
