// The agency's AI settings (the AI sales agent): whether the agent answers customers by itself, whether leads are scored,
// the name it signs as, how it speaks (language, style, emojis, tone) and the agency's own instructions, when it steps
// back for a person, how it follows up a silent customer, how many messages it may write in one chat a day, and whether
// it learns from the chats. Saved by whoever manages settings; audited.
import {
  aiEmojiLevels,
  aiHandoffPolicies,
  aiLanguages,
  aiStyles,
  aiTones,
  type SaveAiSettingsInput,
} from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";

const columns = {
  autopilot: true,
  scoring: true,
  agentName: true,
  instructions: true,
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
  learnedAt: true,
} as const;

export type AiSettingsRow = SaveAiSettingsInput & { learnedAt: Date | null };

export const defaultAiSettings: AiSettingsRow = {
  autopilot: false,
  scoring: true,
  agentName: "",
  instructions: "",
  followUpHours: 4,
  maxRepliesPerDay: 25,
  language: "customer",
  languageOther: "",
  style: "human",
  emojis: "few",
  tone: "friendly",
  handoff: "alert",
  smartFollowUp: true,
  learning: true,
  learnedAt: null,
};

/** A stored word read back as one of its values; the check constraint keeps others out, this keeps the type honest. */
const oneOf = <T extends string>(values: readonly T[], value: string, fallback: T): T =>
  values.find((one) => one === value) ?? fallback;

type StoredRow = Omit<AiSettingsRow, "language" | "style" | "emojis" | "tone" | "handoff"> & {
  language: string;
  style: string;
  emojis: string;
  tone: string;
  handoff: string;
};

function read(row: StoredRow): AiSettingsRow {
  return {
    ...row,
    language: oneOf(aiLanguages, row.language, "customer"),
    style: oneOf(aiStyles, row.style, "human"),
    emojis: oneOf(aiEmojiLevels, row.emojis, "few"),
    tone: oneOf(aiTones, row.tone, "friendly"),
    handoff: oneOf(aiHandoffPolicies, row.handoff, "alert"),
  };
}

export async function aiSettingsOf(tx: OrgTx): Promise<AiSettingsRow> {
  const row = await tx.aiSettings.findFirst({ select: columns });
  return row === null ? defaultAiSettings : read(row);
}

export async function saveAiSettings(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveAiSettingsInput,
): Promise<AiSettingsRow> {
  const before = await aiSettingsOf(tx);
  const data = { ...input, updatedBy: access.userId };
  const existing = await tx.aiSettings.findFirst({ select: { organizationId: true } });
  const row = read(
    existing === null
      ? await tx.aiSettings.create({ data, select: columns })
      : await tx.aiSettings.update({ where: { organizationId: existing.organizationId }, data, select: columns }),
  );
  await recordAudit(tx, access, {
    action: "ai.settings-changed",
    entityType: "ai_settings",
    entityId: access.organizationId,
    before: { autopilot: before.autopilot, scoring: before.scoring, handoff: before.handoff },
    after: { autopilot: row.autopilot, scoring: row.scoring, handoff: row.handoff },
  });
  return row;
}
