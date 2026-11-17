// Which agent answers an agency's chats (lite, natural or one; natural unless chosen otherwise). Only platform staff set it, through the console; the agency's
// own settings saves never name the column, so they leave it as it was.
import type { AgentKind } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Actor } from "../kernel/index.js";

/** The agent the agency chose: natural for an agency with no autopilot row (the column's default). */
export async function agentOf(tx: OrgTx): Promise<AgentKind> {
  const row = await tx.aiAutopilot.findFirst({ select: { agent: true } });
  return row?.agent === "lite" || row?.agent === "one" ? row.agent : "natural";
}

/** Changes the agent (creating the row when absent) and audits it; asking for the agent already chosen changes nothing. */
export async function setAgent(tx: OrgTx, actor: Actor, agent: AgentKind): Promise<{ changed: boolean }> {
  const before = await agentOf(tx);
  if (before === agent) return { changed: false };
  await tx.aiAutopilot.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, agent, updatedBy: actor.userId },
    update: { agent, updatedBy: actor.userId },
  });
  await recordAudit(tx, actor, {
    action: "ai-agent.agent-changed",
    entityType: "ai_autopilot",
    entityId: actor.organizationId,
    before: { agent: before },
    after: { agent },
  });
  return { changed: true };
}
