// Forgets a removed member's browsers (ADR 0007): when identity removes someone, their push subscriptions go, so a
// shared device that was never signed out gets no more pushes for them.
import { staffRemovedEvent } from "@travel-crm/contracts/identity";
import { defineListener, type EventListener } from "../jobs/index.js";

/**
 * Listens for "staff.removed" and deletes every push subscription of the person removed, in the event's organization.
 * A rerun finds nothing left and deletes nothing. The rows go a moment after the removal, not with it, which is
 * harmless: delivery already skips people who have left.
 */
export const forgetPushSubscriptionsListener: EventListener = defineListener({
  name: "notifications.forget-push-subscriptions",
  eventType: "staff.removed",
  payload: staffRemovedEvent,
  handle: async (event, context) => {
    await context.forOrg((tx) => tx.pushSubscription.deleteMany({ where: { userId: event.payload.userId } }));
  },
});
