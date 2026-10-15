// Erasing one record (spec 5): its share links go, with every open recorded against them. A link's label names what
// was shared ("Quotation for Asha Mehta"), and its opens keep the visitor's network and browser. Run by the platform's
// erasure as the platform role; the runtime role may not delete either.
import type { OrgTx } from "@travel-crm/db";
import type { SharedRecord } from "./share-links.js";

/**
 * Deletes the record's share links and their opens, and returns how many of each went, with the ids of the
 * `share-link.opened` events their opens published: the notifications those events caused quote the link's label, so
 * the erasure deletes them too (notifications' `forgetRecordNotifications`).
 */
export async function forgetRecordShareLinks(
  tx: OrgTx,
  record: SharedRecord & { organizationId: string },
): Promise<{ shareLinks: number; opens: number; openedEventIds: string[] }> {
  const { organizationId, recordType, recordId } = record;
  const links = await tx.shareLink.findMany({ where: { organizationId, recordType, recordId }, select: { id: true } });
  const ids = links.map((link) => link.id);
  if (ids.length === 0) return { shareLinks: 0, opens: 0, openedEventIds: [] };
  // This module's own events, read back by their payload: { shareLinkId, openId }.
  const events = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM outbox_event
    WHERE organization_id = ${organizationId}::uuid AND type = 'share-link.opened'
      AND payload->>'shareLinkId' = ANY(${ids}::text[])`;
  const opens = await tx.shareLinkOpen.deleteMany({ where: { organizationId, shareLinkId: { in: ids } } });
  const shareLinks = await tx.shareLink.deleteMany({ where: { organizationId, id: { in: ids } } });
  return { shareLinks: shareLinks.count, opens: opens.count, openedEventIds: events.map((event) => event.id) };
}
