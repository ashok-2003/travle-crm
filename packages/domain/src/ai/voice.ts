// The agency's way of talking and whether a chat is an everyday conversation, as stored (the earlier agent reads them;
// no screen sets either now). The style stays a way of talking only: the agent still says it is an AI to anyone who asks.
import type { OrgTx } from "@travel-crm/db";
import type { AgentVoice } from "./agent-prompt.js";
import type { AutopilotRow } from "./autopilot.js";

/** The agency's way of talking, if one was given. */
export async function agencyVoiceOf(tx: OrgTx): Promise<AgentVoice | null> {
  const row = await tx.aiAutopilot.findFirst({
    select: { voiceName: true, voiceProfile: true, voiceExamples: true },
  });
  return row?.voiceName == null || row.voiceProfile == null
    ? null
    : { name: row.voiceName, profile: row.voiceProfile, examples: row.voiceExamples };
}

/** Whether a chat is an everyday conversation, not a sale: the chat's own choice, else the agency's. */
export async function naturalIn(tx: OrgTx, conversationId: string, settings: AutopilotRow): Promise<boolean> {
  const chat = await tx.aiChat.findFirst({ where: { conversationId }, select: { persona: true } });
  return chat?.persona === "natural" || (chat?.persona !== "sales" && settings.persona === "natural");
}
