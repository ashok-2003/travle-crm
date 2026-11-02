// The agency's own switch for Suggest reply and its instructions to the AI. Off until an Owner or Admin (ai:manage) turns
// it on; every change is audited with what changed, never the instructions' words.
import { aiSettings, type AiSettings, type SaveAiSettingsInput } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { organizationTimeZone, type MemberAccess } from "../identity/index.js";
import { MONTHLY_AI_LIMIT, usedThisMonth } from "./usage.js";

const columns = { enabled: true, scoring: true, fillLeads: true, instructions: true } as const;

/** Whether the agency has turned Suggest reply on. */
export async function aiEnabled(tx: OrgTx): Promise<boolean> {
  return (await tx.aiSettings.findFirst({ select: { enabled: true } }))?.enabled ?? false;
}

/** Whether the AI scores leads from their chats: on unless the agency turned it off. */
export async function aiScoringOn(tx: OrgTx): Promise<boolean> {
  return (await tx.aiSettings.findFirst({ select: { scoring: true } }))?.scoring ?? true;
}

/** Whether new WhatsApp leads are filled in from their first messages: on unless the agency turned it off. */
export async function aiFillLeadsOn(tx: OrgTx): Promise<boolean> {
  return (await tx.aiSettings.findFirst({ select: { fillLeads: true } }))?.fillLeads ?? true;
}

export async function aiSettingsOf(
  tx: OrgTx,
  context: { organizationId: string; providerReady: boolean; now: Date },
): Promise<AiSettings> {
  const row = await tx.aiSettings.findFirst({ select: columns });
  const timeZone = await organizationTimeZone(tx, context.organizationId);
  return aiSettings.parse({
    enabled: row?.enabled ?? false,
    scoring: row?.scoring ?? true,
    fillLeads: row?.fillLeads ?? true,
    instructions: row?.instructions ?? "",
    providerReady: context.providerReady,
    monthlyLimit: MONTHLY_AI_LIMIT,
    usedThisMonth: await usedThisMonth(tx, context.now, timeZone),
  });
}

export async function saveAiSettings(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveAiSettingsInput,
  context: { providerReady: boolean; now: Date },
): Promise<AiSettings> {
  const before = await tx.aiSettings.findFirst({ select: columns });
  const data = {
    enabled: input.enabled,
    scoring: input.scoring,
    fillLeads: input.fillLeads ?? before?.fillLeads ?? true,
    instructions: input.instructions,
    updatedBy: access.userId,
  };
  await tx.aiSettings.upsert({
    where: { organizationId: access.organizationId },
    create: { organizationId: access.organizationId, ...data },
    update: data,
  });
  await recordAudit(tx, access, {
    action: "ai-settings.changed",
    entityType: "ai_settings",
    entityId: access.organizationId,
    before: {
      enabled: before?.enabled ?? false,
      scoring: before?.scoring ?? true,
      fillLeads: before?.fillLeads ?? true,
      instructionsLength: before?.instructions.length ?? 0,
    },
    after: {
      enabled: input.enabled,
      scoring: input.scoring,
      fillLeads: data.fillLeads,
      instructionsLength: input.instructions.length,
    },
  });
  return aiSettingsOf(tx, { organizationId: access.organizationId, ...context });
}
