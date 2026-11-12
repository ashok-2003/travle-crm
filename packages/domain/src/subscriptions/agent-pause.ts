// Whether the WhatsApp agent is paused by platform staff, for every agency or for this one. Read straight from the
// database on every call (never the access cache), so a pause bites at once.
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { actorIn, type ConsoleActor } from "./console-actor.js";
import { lockSubscriptionRow, subscriptionNotFound } from "./state.js";

/** Why the agent may not write now: paused for every agency, or for this one; null when it runs. */
export type AgentPause = { scope: "everyone" | "agency"; since: Date } | null;

/** The pause that applies to this agency: "everyone" wins; with no subscription row only that one can apply. */
export async function agentPauseOf(tx: OrgTx, organizationId: string): Promise<AgentPause> {
  const policy = await tx.subscriptionPolicy.findUnique({ where: { id: true }, select: { aiAgentPausedAt: true } });
  if (policy?.aiAgentPausedAt) return { scope: "everyone", since: policy.aiAgentPausedAt };
  const subscription = await tx.subscription.findUnique({
    where: { organizationId },
    select: { aiAgentPausedAt: true },
  });
  if (subscription?.aiAgentPausedAt) return { scope: "agency", since: subscription.aiAgentPausedAt };
  return null;
}

/**
 * Pauses or resumes the agent for this one agency, recorded in its audit log under the admin's name. Asking for the
 * state it is already in changes and records nothing. The caller is the console, in a platform transaction.
 * Returns the pause now in force for the agency alone, and whether this call changed it.
 */
export async function setAgencyAgentPause(
  tx: OrgTx,
  by: ConsoleActor,
  organizationId: string,
  paused: boolean,
  now: Date = new Date(),
): Promise<{ changed: boolean; since: Date | null }> {
  if (paused && by.userId === null) throw new RangeError("A pause names the admin who made it");
  if (!(await lockSubscriptionRow(tx, organizationId))) throw subscriptionNotFound();
  const { aiAgentPausedAt } = await tx.subscription.findUniqueOrThrow({
    where: { organizationId },
    select: { aiAgentPausedAt: true },
  });
  if ((aiAgentPausedAt !== null) === paused) return { changed: false, since: aiAgentPausedAt };
  await tx.subscription.update({
    where: { organizationId },
    data: paused
      ? { aiAgentPausedAt: now, aiAgentPausedBy: by.userId }
      : { aiAgentPausedAt: null, aiAgentPausedBy: null },
  });
  await recordAudit(tx, actorIn(organizationId, by), {
    action: paused ? "ai-agent.paused" : "ai-agent.resumed",
    entityType: "subscription",
    entityId: organizationId,
    before: { paused: !paused },
    after: { paused },
  });
  return { changed: true, since: paused ? now : null };
}
