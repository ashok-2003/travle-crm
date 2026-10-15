// Blanking stored webhook payloads (ADR 0013, ADR 0022): a purge or an erasure keeps an event's provider id, so a
// replay is still ignored, and drops what the provider sent, which may hold personal data. The platform role only.
import type { OrgTx } from "@travel-crm/db";
import { webhookEvents } from "@travel-crm/db/webhooks";

/**
 * Tombstones the events processed for the organization: their payloads and headers blanked, their ids kept. An event
 * still waiting to be processed is left alone (its handler needs it) and counted, so the caller can run this again
 * once it has been processed. Runs in a platform transaction.
 */
export async function tombstoneWebhookEvents(
  tx: OrgTx,
  organizationId: string,
): Promise<{ tombstoned: number; waiting: number }> {
  const events = webhookEvents(tx);
  const { count } = await events.updateMany({
    where: { resolvedOrganizationId: organizationId, processedAt: { not: null }, tombstonedAt: null },
    data: { payload: "", headers: {}, tombstonedAt: new Date() },
  });
  // Unprocessed events have no organization yet, unless a handler failed after finding it: those wait.
  const waiting = await events.count({ where: { resolvedOrganizationId: organizationId, processedAt: null } });
  return { tombstoned: count, waiting };
}
