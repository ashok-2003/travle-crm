// The agency's autopilot settings as the one WhatsApp agent reads them: whether it answers chats by itself, the name it
// writes as, and the day's cap on replies. The AI agent page's setup writes the switch and the name; other columns of
// the row (the earlier agents') are kept in the table, read by nothing.
import type { OrgTx } from "@travel-crm/db";

/** The settings as the agent reads them: every field has its default when the agency saved none. */
export interface AutopilotRow {
  autopilot: boolean;
  agentName: string;
  maxRepliesPerDay: number;
}

export const autopilotDefaults: AutopilotRow = {
  autopilot: false,
  agentName: "",
  maxRepliesPerDay: 25,
};

const columns = { autopilot: true, agentName: true, maxRepliesPerDay: true } as const;

/** The agency's autopilot settings, the defaults (everything off) when it saved none. */
export async function autopilotOf(tx: OrgTx): Promise<AutopilotRow> {
  const row = await tx.aiAutopilot.findFirst({ select: columns });
  return row ?? autopilotDefaults;
}
