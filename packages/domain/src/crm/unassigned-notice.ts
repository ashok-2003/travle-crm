// The Unassigned notice (release 4, spec 4.7): a new lead nobody could take lands in the Unassigned queue, and everyone
// who can assign leads is told once, in the bell and by push. The listener runs in the worker on lead.created, keyed on
// the event, so a repeat tells no one twice.
import { leadCreatedEvent } from "@travel-crm/contracts/crm";
import { defineListener, type EventListener } from "../jobs/index.js";
import { notify } from "../notifications/index.js";
import { noticeKey } from "./notice-key.js";

export function notifyUnassignedLeadListener(dependencies: {
  managers: (organizationId: string) => Promise<string[]>;
}): EventListener {
  return defineListener({
    name: "crm.notify-unassigned-lead",
    eventType: "lead.created",
    payload: leadCreatedEvent,
    handle: async (event, context) => {
      const managers = await dependencies.managers(event.organizationId);
      if (managers.length === 0) return;
      await context.forOrg(async (tx) => {
        const lead = await tx.lead.findUnique({
          where: { id: event.payload.leadId },
          select: { ownerUserId: true, deletedAt: true, person: { select: { name: true } } },
        });
        if (lead?.ownerUserId !== null || lead.deletedAt !== null) return;
        await notify(tx, context.actor, {
          recipientUserIds: managers,
          sourceEventId: noticeKey(event.id, "lead.unassigned"),
          kind: "lead.unassigned",
          title: "A new lead has no owner",
          body: lead.person.name,
          link: `/leads/${event.payload.leadId}`,
          channels: ["push"],
        });
      });
    },
  });
}
