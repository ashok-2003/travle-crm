// The agency's autopilot settings (AI step 2): whether the AI answers WhatsApp chats by itself, how it speaks, when it
// follows up, whose way of talking it copies, whether it writes notes on leads and sends the agency's media, how
// customers pay and the rules it always follows. Off until an Owner or Admin (ai:manage) turns it on, and only for an
// agency that has the AI switched on; every change is audited with what changed, never the words typed in.
import { autopilotSettings, type AutopilotSettings, type SaveAutopilotInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";

/** The settings as the agent reads them: every field has its default when the agency saved none. */
export interface AutopilotRow {
  autopilot: boolean;
  agentName: string;
  followUpHours: number;
  maxRepliesPerDay: number;
  language: SaveAutopilotInput["language"];
  languageOther: string;
  style: SaveAutopilotInput["style"];
  emojis: SaveAutopilotInput["emojis"];
  tone: SaveAutopilotInput["tone"];
  handoff: SaveAutopilotInput["handoff"];
  smartFollowUp: boolean;
  learning: boolean;
  persona: SaveAutopilotInput["persona"];
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

const toSettings = (row: AutopilotRow): AutopilotSettings =>
  autopilotSettings.parse({
    ...row,
    learnedAt: row.learnedAt?.toISOString() ?? null,
    voice:
      row.voiceName === null || row.voiceProfile === null
        ? null
        : { name: row.voiceName, profile: row.voiceProfile, examples: row.voiceExamples.length },
  });

export async function autopilotSettingsOf(tx: OrgTx): Promise<AutopilotSettings> {
  return toSettings(await autopilotOf(tx));
}

export async function saveAutopilot(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveAutopilotInput,
): Promise<AutopilotSettings> {
  const before = await autopilotOf(tx);
  const data = { ...input, updatedBy: access.userId };
  await tx.aiAutopilot.upsert({
    where: { organizationId: access.organizationId },
    create: { organizationId: access.organizationId, ...data },
    update: data,
  });
  const switches = (row: { autopilot: boolean; learning: boolean; persona: string; handoff: string }) => ({
    autopilot: row.autopilot,
    learning: row.learning,
    persona: row.persona,
    handoff: row.handoff,
  });
  await recordAudit(tx, access, {
    action: "ai-autopilot.changed",
    entityType: "ai_autopilot",
    entityId: access.organizationId,
    before: switches(before),
    after: switches(input),
  });
  return autopilotSettingsOf(tx);
}
