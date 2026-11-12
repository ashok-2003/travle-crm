// The lite agent's per-agency switch: platform staff turn it on from the console; the turn runs only while the AI module's
// switch is on too. Agencies never reach it (their autopilot saves leave the column alone).
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import type { Actor } from "../../kernel/index.js";
import { aiEnabled } from "../settings.js";

/** The lite agent answers this agency's chats: the AI module's switch and the console's lite switch are both on. */
export async function liteAgentOn(tx: OrgTx): Promise<boolean> {
  if (!(await aiEnabled(tx))) return false;
  return (await tx.aiAutopilot.findFirst({ select: { lite: true } }))?.lite === true;
}

/** The console's switch; writes only `lite`, audited; true when it changed. */
export async function setLiteAgent(tx: OrgTx, actor: Actor, lite: boolean): Promise<boolean> {
  const before = (await tx.aiAutopilot.findFirst({ select: { lite: true } }))?.lite ?? false;
  if (before === lite) return false;
  await tx.aiAutopilot.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, lite, updatedBy: actor.userId },
    update: { lite, updatedBy: actor.userId },
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
