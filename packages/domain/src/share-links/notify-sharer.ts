// Tells the person who shared a link that it was opened (spec 9.3, 9.4): an agent knows their customer has looked at
// the quotation. In the bell, and by email and push unless they opted out.
import { shareLinkOpenedEvent } from "@travel-crm/contracts/share-links";
import { defineListener, type EventListener } from "../jobs/index.js";
import { notify } from "../notifications/index.js";

export function notifySharerListener(): EventListener {
  return defineListener({
    name: "share-links.notify-sharer",
    eventType: "share-link.opened",
    payload: shareLinkOpenedEvent,
    handle: async (event, context) => {
      await context.forOrg(async (tx) => {
        const link = await tx.shareLink.findUnique({ where: { id: event.payload.shareLinkId } });
        // A link the system made has nobody to tell.
        if (!link?.createdBy) return;
        await notify(tx, context.actor, {
          recipientUserIds: [link.createdBy],
          // Listeners run at least once: keyed on the event, a second run adds no second notification.
          sourceEventId: event.id,
          kind: "share-link.opened",
          title: `Opened: ${link.label}`,
          body: "The link you shared has just been opened.",
          channels: ["email", "push"],
        });
      });
    },
  });
}
