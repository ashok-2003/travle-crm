// One chat's own way of talking, as stored (from an export the owner imported before that screen went): the earlier agent
// reads it with every reply in that chat; it wins over the agency's way of talking there. Nothing sets or clears it now.
import type { OrgTx } from "@travel-crm/db";
import type { AgentVoice } from "./agent-prompt.js";
import { agencyVoiceOf } from "./voice.js";

/** The stored history read back: lines that aren't { own, text } are dropped. */
function historyOf(stored: unknown): { own: boolean; text: string }[] {
  const lines: { own: boolean; text: string }[] = [];
  if (!Array.isArray(stored)) return lines;
  for (const line of stored as Record<string, unknown>[]) {
    if (typeof line.own === "boolean" && typeof line.text === "string") lines.push({ own: line.own, text: line.text });
  }
  return lines;
}

/** The way of talking in one chat: its own (with what the two talked about), else the agency's; and which it is. */
export async function chatVoiceOf(tx: OrgTx, conversationId: string): Promise<(AgentVoice & { own: boolean }) | null> {
  const row = await tx.aiChat.findFirst({
    where: { conversationId },
    select: {
      voiceName: true,
      voiceProfile: true,
      voiceExamples: true,
      voiceContext: true,
      voiceHistory: true,
    },
  });
  if (row?.voiceName != null && row.voiceProfile != null) {
    return {
      name: row.voiceName,
      profile: row.voiceProfile,
      examples: row.voiceExamples,
      context: row.voiceContext,
      history: historyOf(row.voiceHistory),
      own: true,
    };
  }
  const agency = await agencyVoiceOf(tx);
  return agency === null ? null : { ...agency, own: false };
}
