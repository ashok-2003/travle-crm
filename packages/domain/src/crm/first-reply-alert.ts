// The slow-reply alert (release C, spec 3.2): when the agency has set how long a new lead may wait for a first reply,
// each new lead gets a check that long after it came in; if it is still New with no reply by then, the agency's Owner
// is told, in the bell and by push. Nothing is reassigned. The check is a delayed job (job data: ids only); the alert
// is keyed on the lead's lead.created event, so a check that runs twice tells once.
import { firstReplyCheckJob, leadCreatedEvent } from "@travel-crm/contracts/crm";
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import { defineListener, type EventListener } from "../jobs/index.js";
import { systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";

export const FIRST_REPLY_CHECK_QUEUE = "crm.first-reply-check";

const MINUTE_MS = 60 * 1000;

/** On each new lead, queues its first-reply check for when its wait runs out, if the agency set one. */
export function scheduleFirstReplyCheckListener(dependencies: { queue: JobQueue }): EventListener {
  return defineListener({
    name: "crm.schedule-first-reply-check",
    eventType: "lead.created",
    payload: leadCreatedEvent,
    handle: async (event, context) => {
      const due = await context.forOrg(async (tx) => {
        const settings = await tx.assignmentSettings.findFirst({ select: { slowReplyMinutes: true } });
        if (!settings?.slowReplyMinutes) return null;
        const lead = await tx.lead.findUnique({
          where: { id: event.payload.leadId },
          select: { createdAt: true, stage: true },
        });
        if (lead?.stage !== "new") return null;
        return new Date(lead.createdAt.getTime() + settings.slowReplyMinutes * MINUTE_MS);
      });
      // An imported lead dated long ago is past its wait already: it needs no alert.
      if (due === null || due.getTime() < Date.now() - MINUTE_MS) return;
      await dependencies.queue.send(
        FIRST_REPLY_CHECK_QUEUE,
        { organizationId: event.organizationId, leadId: event.payload.leadId, sourceEventId: event.id },
        { startAfter: due },
      );
    },
  });
}

/** The check itself: a lead still New with no reply tells the agency's Owner. */
export async function checkFirstReply(
  dependencies: { db: Database; firstOwner: (organizationId: string) => Promise<string | null> },
  data: unknown,
): Promise<void> {
  const { organizationId, leadId, sourceEventId } = firstReplyCheckJob.parse(data);
  const ownerUserId = await dependencies.firstOwner(organizationId);
  if (ownerUserId === null) return;
  await dependencies.db.forOrg(organizationId, async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      select: { stage: true, firstReplyAt: true, deletedAt: true, person: { select: { name: true } } },
    });
    if (lead?.stage !== "new" || lead.deletedAt !== null || lead.firstReplyAt !== null) return;
    await notify(tx, systemActor(organizationId), {
      recipientUserIds: [ownerUserId],
      sourceEventId,
      kind: "lead.slow-reply",
      title: "A new lead is waiting for a reply",
      body: lead.person.name,
      link: `/leads/${leadId}`,
      channels: ["push"],
    });
  });
}
