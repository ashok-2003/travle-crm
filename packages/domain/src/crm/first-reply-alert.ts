// The slow-reply alert (release 4, spec 4.5, 4.6): when the agency has set how long a new lead may wait for a first
// reply, each new lead gets a check that long after it came in, counted in working minutes in the agency's time zone;
// if it is still New with no reply by then, everyone who can assign leads is told, in the bell and by push. Nothing is
// reassigned. The check is a delayed job (job data: ids only); the alert is keyed on the lead's lead.created event, so
// a check that runs twice tells once.
import { firstReplyCheckJob, leadCreatedEvent } from "@travel-crm/contracts/crm";
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import { defineListener, type EventListener } from "../jobs/index.js";
import { addWorkingMinutes, systemActor } from "../kernel/index.js";
import { notify } from "../notifications/index.js";

export const FIRST_REPLY_CHECK_QUEUE = "crm.first-reply-check";

const MINUTE_MS = 60 * 1000;

export interface FirstReplyScheduleDependencies {
  queue: JobQueue;
  /** The organization's time zone, in which its working hours are read. */
  timeZone: (organizationId: string) => Promise<string>;
  /** The clock; a test's own. */
  now?: () => Date;
}

/** On each new lead, queues its first-reply check for when its working-time wait runs out, if the agency set one. */
export function scheduleFirstReplyCheckListener(dependencies: FirstReplyScheduleDependencies): EventListener {
  const now = dependencies.now ?? (() => new Date());
  return defineListener({
    name: "crm.schedule-first-reply-check",
    eventType: "lead.created",
    payload: leadCreatedEvent,
    handle: async (event, context) => {
      const waiting = await context.forOrg(async (tx) => {
        const settings = await tx.assignmentSettings.findFirst({
          select: { slowReplyMinutes: true, workdays: true, dayOpensMinute: true, dayClosesMinute: true },
        });
        if (!settings?.slowReplyMinutes) return null;
        const lead = await tx.lead.findUnique({
          where: { id: event.payload.leadId },
          select: { createdAt: true, stage: true },
        });
        if (lead?.stage !== "new") return null;
        return { settings, minutes: settings.slowReplyMinutes, createdAt: lead.createdAt };
      });
      if (waiting === null) return;
      const { settings } = waiting;
      const due = addWorkingMinutes(
        waiting.createdAt,
        waiting.minutes,
        {
          workdays: settings.workdays,
          opensMinute: settings.dayOpensMinute,
          closesMinute: settings.dayClosesMinute,
        },
        await dependencies.timeZone(event.organizationId),
      );
      // An imported lead dated long ago is past its wait already: it needs no alert.
      if (due.getTime() < now().getTime() - MINUTE_MS) return;
      await dependencies.queue.send(
        FIRST_REPLY_CHECK_QUEUE,
        { organizationId: event.organizationId, leadId: event.payload.leadId, sourceEventId: event.id },
        { startAfter: due },
      );
    },
  });
}

/** The check itself: a lead still New with no reply tells everyone who can assign leads. */
export async function checkFirstReply(
  dependencies: { db: Database; managers: (organizationId: string) => Promise<string[]> },
  data: unknown,
): Promise<void> {
  const { organizationId, leadId, sourceEventId } = firstReplyCheckJob.parse(data);
  const managers = await dependencies.managers(organizationId);
  if (managers.length === 0) return;
  await dependencies.db.forOrg(organizationId, async (tx) => {
    const lead = await tx.lead.findUnique({
      where: { id: leadId },
      select: { stage: true, firstReplyAt: true, deletedAt: true, person: { select: { name: true } } },
    });
    if (lead?.stage !== "new" || lead.deletedAt !== null || lead.firstReplyAt !== null) return;
    await notify(tx, systemActor(organizationId), {
      recipientUserIds: managers,
      sourceEventId,
      kind: "lead.slow-reply",
      title: "A new lead is waiting for a reply",
      body: lead.person.name,
      link: `/leads/${leadId}`,
      channels: ["push"],
    });
  });
}
