// The lite agent's per-agency switch: platform staff turn it on from the console; the turn runs only while the AI module's
// switch is on too. Agencies never reach it (their autopilot saves leave the column alone). A change lets go every
// follow-up the chats had planned.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import type { Actor } from "../../kernel/index.js";
import { aiEnabled } from "../settings.js";

/** The lite agent answers this agency's chats: the AI module's switch and the console's lite switch are both on. */
export async function liteAgentOn(tx: OrgTx): Promise<boolean> {
  if (!(await aiEnabled(tx))) return false;
  return (await tx.aiAutopilot.findFirst({ select: { lite: true } }))?.lite === true;
}

/**
 * The console's switch; writes only `lite`, audited, and lets go every follow-up the agency's chats have planned: one
 * agent's plan (its time, its count) is never sent by the other, whose hours and rules differ. True when it changed.
 */
export async function setLiteAgent(tx: OrgTx, actor: Actor, lite: boolean): Promise<boolean> {
  const before = (await tx.aiAutopilot.findFirst({ select: { lite: true } }))?.lite ?? false;
  if (before === lite) return false;
  await tx.aiAutopilot.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, lite, updatedBy: actor.userId },
    update: { lite, updatedBy: actor.userId },
  });
  await tx.aiChat.updateMany({
    where: { OR: [{ followUpAt: { not: null } }, { followUpsSent: { not: 0 } }] },
    data: { followUpAt: null, followUpsSent: 0 },
  });
  const entry = {
    entityType: "ai_autopilot",
    entityId: actor.organizationId,
    before: { lite: before },
    after: { lite },
  };
  // Each branch names its action as a literal, so the audit test can read every recorded action.
  if (lite) await recordAudit(tx, actor, { action: "ai-agent.lite-on", ...entry });
  else await recordAudit(tx, actor, { action: "ai-agent.lite-off", ...entry });
  return true;
}
