// The agency's autopilot settings as the agent reads them: whether the AI answers WhatsApp chats by itself, and the other
// columns the earlier agents read (no screen sets them now; the AI agent page's setup writes the switch, name and tone).
import type {
  aiEmojiLevels,
  aiHandoffPolicies,
  aiLanguages,
  aiPersonas,
  aiStyles,
  aiTones,
} from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";

/** The settings as the agent reads them: every field has its default when the agency saved none. */
export interface AutopilotRow {
  autopilot: boolean;
  /** The grounded turn answers instead of the first one (an owner's switch, set by hand for now). */
  grounded: boolean;
  /** The lite agent answers instead of the earlier ones; only platform staff set it (`setLiteAgent`), never an agency's save. */
  lite: boolean;
  agentName: string;
  followUpHours: number;
  maxRepliesPerDay: number;
  language: (typeof aiLanguages)[number];
  languageOther: string;
  style: (typeof aiStyles)[number];
  emojis: (typeof aiEmojiLevels)[number];
  tone: (typeof aiTones)[number];
  handoff: (typeof aiHandoffPolicies)[number];
  smartFollowUp: boolean;
  learning: boolean;
  persona: (typeof aiPersonas)[number];
  learnedAt: Date | null;
  voiceName: string | null;
  voiceProfile: string | null;
  voiceExamples: string[];
  leadNotes: boolean;
  sendMedia: boolean;
  paymentDetails: string;
  strictRules: string;
  followUpTasks: boolean;
}

export const autopilotDefaults: AutopilotRow = {
  autopilot: false,
  grounded: false,
  lite: false,
  agentName: "",
  followUpHours: 4,
  maxRepliesPerDay: 25,
  language: "customer",
  languageOther: "",
  style: "human",
  emojis: "few",
  tone: "friendly",
  handoff: "alert",
  smartFollowUp: true,
  learning: false,
  persona: "sales",
  learnedAt: null,
  voiceName: null,
  voiceProfile: null,
  voiceExamples: [],
  leadNotes: true,
  sendMedia: true,
  paymentDetails: "",
  strictRules: "",
  followUpTasks: true,
};

const columns = {
  autopilot: true,
  grounded: true,
  lite: true,
  agentName: true,
  followUpHours: true,
  maxRepliesPerDay: true,
  language: true,
  languageOther: true,
  style: true,
  emojis: true,
  tone: true,
  handoff: true,
  smartFollowUp: true,
  learning: true,
  persona: true,
  learnedAt: true,
  voiceName: true,
  voiceProfile: true,
  voiceExamples: true,
  leadNotes: true,
  sendMedia: true,
  paymentDetails: true,
  strictRules: true,
  followUpTasks: true,
} as const;

/** The agency's autopilot settings, the defaults (everything off) when it saved none. */
export async function autopilotOf(tx: OrgTx): Promise<AutopilotRow> {
  const row = await tx.aiAutopilot.findFirst({ select: columns });
  return row === null ? autopilotDefaults : (row as AutopilotRow);
}
