// Tells the agency's managers that its agent is switched on but answers nobody: its setup came undone (the payment QR
// removed, the last package it could sell no longer for sale), so every turn ends not_ready with nothing sent. Without
// this, every chat would go quiet and nobody would know until someone opened the AI agent page. Once a day, whatever
// the number of turns refused: the key is the agency's own day.
import { noticeKey } from "../crm/index.js";
import { organizationTimeZone } from "../identity/index.js";
import { calendarDateIn, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";
import type { AgentDependencies } from "./agent.js";

export const AI_NOT_READY_KIND = "ai.agent-not-ready";

export async function tellAgentNotReady(
  dependencies: Pick<AgentDependencies, "db" | "managers">,
  organizationId: string,
  now: Date,
): Promise<void> {
  // Whoever manages settings: they add the payment QR and choose what the AI may sell (the Owner always does).
  const recipients = await dependencies.managers(organizationId);
  if (recipients.length === 0) return;
  await dependencies.db.forOrg(organizationId, async (tx) => {
    const today = calendarDateIn(now, await organizationTimeZone(tx, organizationId));
    await notify(tx, systemActor(organizationId), {
      recipientUserIds: recipients,
      sourceEventId: noticeKey(`${organizationId}:${today}`, AI_NOT_READY_KIND),
      kind: "ai.agent-not-ready",
      title: "Your AI agent isn't answering customers",
      body:
        "It is switched on, but its setup isn't finished, so it sends no reply to anyone. Finish the setup, " +
        "or turn the agent off so your team knows to answer.",
      link: "/ai-agent?tab=setup",
      channels: ["email", "push"],
    });
  });
}
