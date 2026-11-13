// Pausing the WhatsApp AI agent from the console, for every agency or for one (super admins only; the console's
// procedures check). Each change is written once, in the platform log, and an agency's also in its own audit log.
import type {
  AgentPauseState,
  OrganizationAgentPause,
  PauseEveryoneInput,
  PauseOrganizationInput,
  ResumeOneAtATimeResult,
} from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";
import { DomainError } from "../kernel/index.js";
import * as subscriptions from "../subscriptions/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

// Named constants, so the console's list of known actions can be held to the ones recorded here.
const PAUSED_EVERYONE = "ai-agent.paused-everyone";
const RESUMED_EVERYONE = "ai-agent.resumed-everyone";
const PAUSED_AGENCY = "ai-agent.paused";
const RESUMED_AGENCY = "ai-agent.resumed";

type Since = { since: string } | null;
const shown = (at: Date | null | undefined): Since => (at ? { since: at.toISOString() } : null);

/** Whether the agent is paused for every agency. */
export async function agentPauseState(services: PlatformServices): Promise<AgentPauseState> {
  return services.platformDb.transaction(async (tx) => ({ everyone: await everyonePause(tx) }));
}

/** This agency's own pause, and the one for every agency (which wins). */
export async function organizationAgentPause(
  services: PlatformServices,
  organizationId: string,
): Promise<OrganizationAgentPause> {
  return services.platformDb.transaction((tx) => pausesOf(tx, organizationId));
}

/** Pauses or resumes the agent for every agency. */
export async function pauseEveryone(
  services: PlatformServices,
  staff: PlatformActor,
  input: PauseEveryoneInput,
): Promise<AgentPauseState> {
  return services.platformDb.transaction(async (tx) => {
    await setEveryoneAgentPause(tx, staff, input.paused);
    return { everyone: await everyonePause(tx) };
  });
}

/**
 * The every-agency change itself, inside the caller's platform transaction: the policy row's pause, and the platform
 * log's entry. Asking for the state it is already in changes and logs nothing.
 */
export async function setEveryoneAgentPause(
  tx: PlatformTx,
  staff: PlatformActor,
  paused: boolean,
  now: Date = new Date(),
): Promise<void> {
  if (paused && staff.userId === null) throw new RangeError("A pause names the admin who made it");
  const policy = await tx.subscriptionPolicy.findUniqueOrThrow({ where: { id: true } });
  if ((policy.aiAgentPausedAt !== null) === paused) return;
  await tx.subscriptionPolicy.update({
    where: { id: true },
    data: paused
      ? { aiAgentPausedAt: now, aiAgentPausedBy: staff.userId }
      : { aiAgentPausedAt: null, aiAgentPausedBy: null },
  });
  await recordPlatformAudit(tx, staff, {
    action: paused ? PAUSED_EVERYONE : RESUMED_EVERYONE,
    targetType: "platform",
    targetId: "ai-agent",
    before: { paused: !paused },
    after: { paused },
  });
}

/** Pauses or resumes the agent for one agency; it needs a subscription (NOT_FOUND without one). */
export async function pauseOrganization(
  services: PlatformServices,
  staff: PlatformActor,
  input: PauseOrganizationInput,
): Promise<OrganizationAgentPause> {
  return services.platformDb.transaction(async (tx) => {
    const { changed } = await subscriptions.setAgencyAgentPause(tx, staff, input.organizationId, input.paused);
    if (changed) {
      await recordPlatformAudit(tx, staff, {
        action: input.paused ? PAUSED_AGENCY : RESUMED_AGENCY,
        targetType: "organization",
        targetId: input.organizationId,
        targetOrganizationId: input.organizationId,
        before: { paused: !input.paused },
        after: { paused: input.paused },
      });
    }
    return pausesOf(tx, input.organizationId);
  });
}

/** Pauses every agency on its own, then lifts the every-agency pause (one transaction). */
export async function resumeOneAtATime(
  services: PlatformServices,
  staff: PlatformActor,
): Promise<ResumeOneAtATimeResult> {
  return services.platformDb.transaction((tx) => resumeOneAtATimeIn(tx, staff));
}

/**
 * Inside the caller's platform transaction: every agency without its own pause gets one, then the every-agency pause
 * lifts, so no agency answers until it is resumed from its page. An agency already paused alone keeps its pause, its
 * time and its author. The every-agency pause must be on (CONFLICT otherwise, and nothing is written).
 */
export async function resumeOneAtATimeIn(
  tx: PlatformTx,
  staff: PlatformActor,
  now: Date = new Date(),
): Promise<ResumeOneAtATimeResult> {
  // Held from the check to the lift, so two runs can't both see the pause on, and a pause lifted elsewhere isn't missed.
  await tx.$queryRaw`SELECT 1 FROM subscription_policy WHERE id = true FOR NO KEY UPDATE`;
  if ((await everyonePause(tx)) === null) {
    throw new DomainError("CONFLICT", "AGENT_NOT_PAUSED_FOR_EVERYONE", "The AI agent isn't paused for every agency");
  }
  const pending = await tx.subscription.findMany({
    where: { aiAgentPausedAt: null },
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });
  let paused = 0;
  for (const { organizationId } of pending) {
    const { changed } = await subscriptions.setAgencyAgentPause(tx, staff, organizationId, true, now);
    if (!changed) continue;
    paused += 1;
    await recordPlatformAudit(tx, staff, {
      action: PAUSED_AGENCY,
      targetType: "organization",
      targetId: organizationId,
      targetOrganizationId: organizationId,
      before: { paused: false },
      after: { paused: true },
    });
  }
  await setEveryoneAgentPause(tx, staff, false, now);
  return { paused };
}

async function everyonePause(tx: PlatformTx): Promise<Since> {
  const policy = await tx.subscriptionPolicy.findUnique({ where: { id: true }, select: { aiAgentPausedAt: true } });
  return shown(policy?.aiAgentPausedAt);
}

async function pausesOf(tx: PlatformTx, organizationId: string): Promise<OrganizationAgentPause> {
  const subscription = await tx.subscription.findUnique({
    where: { organizationId },
    select: { aiAgentPausedAt: true },
  });
  return { agency: shown(subscription?.aiAgentPausedAt), everyone: await everyonePause(tx) };
}
