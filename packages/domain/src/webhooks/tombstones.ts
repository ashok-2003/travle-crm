// Blanking stored webhook payloads (ADR 0013, ADR 0023): a purge or an erasure keeps an event's provider id, so a
// replay is still ignored, and drops what the provider sent, which may hold personal data. The platform role only.
import type { OrgTx } from "@travel-crm/db";
import { webhookEvents } from "@travel-crm/db/webhooks";

/**
 * Tombstones the organization's events: their payloads and headers blanked, their ids kept. Runs in a platform
 * transaction, and again harmlessly.
 *
 * `waiting` counts the organization's events still in flight: a handler found the organization but failed, and the
 * job is retrying it. An erasure leaves those to their handler, which still needs the payload (a payment to record),
 * and blanks only processed events. A purge (`organizationGone`) blanks them too: no handler can use an event about an
 * organization that no longer exists, and the next retry finds the tombstone and stops.
 */
export async function tombstoneWebhookEvents(
  tx: OrgTx,
  organizationId: string,
  options: { organizationGone?: boolean } = {},
): Promise<{ tombstoned: number; waiting: number }> {
  const events = webhookEvents(tx);
  const waiting = await events.count({
    where: { resolvedOrganizationId: organizationId, processedAt: null, tombstonedAt: null },
  });
  const { count } = await events.updateMany({
    where: {
      resolvedOrganizationId: organizationId,
      tombstonedAt: null,
      ...(options.organizationGone ? {} : { processedAt: { not: null } }),
    },
    data: { payload: "", headers: {}, tombstonedAt: new Date() },
  });
  return { tombstoned: count, waiting };
}
