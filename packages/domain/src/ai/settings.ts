// The agency's AI settings (the AI sales agent): whether the agent answers customers by itself, whether leads are scored,
// the name it signs as, the agency's own instructions, when it nudges a silent customer, and how many messages it may
// write in one chat a day. Saved by whoever manages settings; audited.
import type { SaveAiSettingsInput } from "@travel-crm/contracts/ai";
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
} as const;

export type AiSettingsRow = SaveAiSettingsInput;

export const defaultAiSettings: AiSettingsRow = {
  autopilot: false,
  scoring: true,
  agentName: "",
  instructions: "",
  followUpHours: 4,
  maxRepliesPerDay: 25,
};

export async function aiSettingsOf(tx: OrgTx): Promise<AiSettingsRow> {
  return (await tx.aiSettings.findFirst({ select: columns })) ?? defaultAiSettings;
}

export async function saveAiSettings(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveAiSettingsInput,
): Promise<AiSettingsRow> {
  const before = await aiSettingsOf(tx);
  const data = { ...input, updatedBy: access.userId };
  const existing = await tx.aiSettings.findFirst({ select: { organizationId: true } });
  const row =
    existing === null
      ? await tx.aiSettings.create({ data, select: columns })
      : await tx.aiSettings.update({ where: { organizationId: existing.organizationId }, data, select: columns });
  await recordAudit(tx, access, {
    action: "ai.settings-changed",
    entityType: "ai_settings",
    entityId: access.organizationId,
    before: { autopilot: before.autopilot, scoring: before.scoring },
    after: { autopilot: row.autopilot, scoring: row.scoring },
  });
  return row;
}
