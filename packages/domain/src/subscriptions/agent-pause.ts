// Whether the WhatsApp agent is paused by platform staff, for every agency or for this one. Read straight from the
// database on every call (never the access cache), so a pause bites at once.
import type { OrgTx } from "@travel-crm/db";

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
