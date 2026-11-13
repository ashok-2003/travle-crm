// The console's `lite` column writer, kept only until the console's tools for the move replace it (plan 5, task 4): with one
// agent nothing reads the column, so the switch no longer decides anything. A change lets go every planned follow-up.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import type { Actor } from "../../kernel/index.js";

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
