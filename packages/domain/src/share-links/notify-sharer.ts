// Tells the person who shared a link that it was opened (spec 9.3, 9.4): an agent knows their customer has looked at
// the quotation. In the bell, and by email and push unless they opted out.
import { notifyInput } from "@travel-crm/contracts/notifications";
import { shareLinkOpenedEvent } from "@travel-crm/contracts/share-links";
import type { MemberContact } from "../identity/index.js";
import { defineListener, type EventListener } from "../jobs/index.js";
import { notify } from "../notifications/index.js";

export interface NotifySharerDependencies {
  /** identity's memberContacts: active members only, so someone who has left is told nothing. */
  memberContacts(organizationId: string, userIds: readonly string[]): Promise<MemberContact[]>;
}

const OPENED = "Opened: ";
const ELLIPSIS = "…";

/** Characters as a reader sees them: an emoji sequence or an Indic conjunct is one, however many code points it has. */
const characters = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/**
 * "Opened: <label>" within the notification title's limit. A label may be longer than that allows, so a long one is
 * cut between whole characters (never inside an emoji, a surrogate pair or a conjunct) and ends with an ellipsis.
 */
function openedTitle(label: string): string {
  const max = notifyInput.shape.title.maxLength ?? Number.POSITIVE_INFINITY;
  const whole = `${OPENED}${label}`;
  if (whole.length <= max) return whole;
  // The limit counts UTF-16 code units, as String.length does: an emoji takes two, a family of four takes eleven.
  const room = max - OPENED.length - ELLIPSIS.length;
  let kept = "";
  for (const { segment } of characters.segment(label)) {
    if (kept.length + segment.length > room) break;
    kept += segment;
  }
  return `${OPENED}${kept.trimEnd()}${ELLIPSIS}`;
}

export function notifySharerListener(dependencies: NotifySharerDependencies): EventListener {
  return defineListener({
    name: "share-links.notify-sharer",
    eventType: "share-link.opened",
    payload: shareLinkOpenedEvent,
    handle: async (event, context) => {
      const link = await context.forOrg((tx) => tx.shareLink.findUnique({ where: { id: event.payload.shareLinkId } }));
      // A link the system made has nobody to tell.
      if (!link?.createdBy) return;
      // Nor does a link shared by someone who has left: not even in the bell of an organization they're no longer in.
      const [sharer] = await dependencies.memberContacts(event.organizationId, [link.createdBy]);
      if (!sharer) return;
      await context.forOrg((tx) =>
        notify(tx, context.actor, {
          recipientUserIds: [sharer.userId],
          // Listeners run at least once: keyed on the event, a second run adds no second notification.
          sourceEventId: event.id,
          kind: "share-link.opened",
          title: openedTitle(link.label),
          body: "The link you shared has just been opened.",
          channels: ["email", "push"],
        }),
      );
    },
  });
}
