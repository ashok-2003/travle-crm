// Erasing one record (spec 5): the notifications about it go. A notification about a record links to it
// (`/travellers/<id>`), so the record's id in the link finds it; one caused by an event about the record (a share
// link's open, whose title quotes the link's label) is found by that event. Run by the platform's erasure as the
// platform role; the runtime role may not delete notifications. An email or a push already sent stays sent.
import type { OrgTx } from "@travel-crm/db";
import { isUuid } from "../kernel/index.js";

/** Deletes the organization's notifications about the record, and says how many went. */
export async function forgetRecordNotifications(
  tx: OrgTx,
  about: { organizationId: string; recordId: string; sourceEventIds: readonly string[] },
): Promise<number> {
  // Matched inside the link: anything shorter than a whole id (an empty one) would match every link.
  if (!isUuid(about.recordId)) throw new RangeError("A record's notifications are found by its id: give a UUID");
  const { count } = await tx.notification.deleteMany({
    where: {
      organizationId: about.organizationId,
      OR: [{ link: { contains: about.recordId } }, { sourceEventId: { in: [...about.sourceEventIds] } }],
    },
  });
  return count;
}
