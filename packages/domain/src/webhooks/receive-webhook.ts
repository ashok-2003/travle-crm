// Receives one delivery, in the spec's order (9.7): verify the signature, store the raw payload, queue a job, reply
// 200. The provider's own work happens later, in the worker (process-webhook-event.ts).
import type { Database } from "@travel-crm/db";
import type { JobQueue } from "@travel-crm/integrations/jobs";
import type { WebhookProvider, WebhookRequest } from "./provider.js";

/** The job queue that processes stored events. Its data is `{ webhookEventId }`. */
export const WEBHOOK_PROCESS_QUEUE = "webhooks.process";

/** Headers never stored, whatever a provider asks for: they would be credentials at rest. */
const NEVER_KEPT = new Set(["authorization", "cookie", "proxy-authorization", "set-cookie"]);

export interface WebhookDependencies {
  db: Pick<Database, "withoutOrg">;
  queue: JobQueue;
  providers: readonly WebhookProvider[];
}

/** What the api answers the provider. The route answers 413 itself for a body over its size limit. */
export interface WebhookReceipt {
  status: 200 | 400 | 401 | 404;
}

function keptHeaders(provider: WebhookProvider, headers: Headers): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const name of provider.keptHeaders.map((header) => header.toLowerCase())) {
    const value = headers.get(name);
    if (value !== null && !NEVER_KEPT.has(name)) kept[name] = value;
  }
  return kept;
}

const isShortText = (value: string) => value.length >= 1 && value.length <= 255;

export async function receiveWebhook(
  { db, queue, providers }: WebhookDependencies,
  providerName: string,
  request: WebhookRequest,
): Promise<WebhookReceipt> {
  const provider = providers.find((candidate) => candidate.name === providerName);
  if (!provider) return { status: 404 };
  if (!provider.verify(request)) return { status: 401 };
  const identity = provider.identify(request);
  if (!identity || !isShortText(identity.eventId) || !isShortText(identity.eventType)) return { status: 400 };

  const event = await db.withoutOrg(async (tx) => {
    // A repeated delivery of the same event is not stored again (spec 9.7: repeats are ignored by provider event id).
    await tx.webhookEvent.createMany({
      data: [
        {
          provider: provider.name,
          providerEventId: identity.eventId,
          eventType: identity.eventType,
          headers: keptHeaders(provider, request.headers),
          payload: request.rawBody,
        },
      ],
      skipDuplicates: true,
    });
    return tx.webhookEvent.findUniqueOrThrow({
      where: { provider_providerEventId: { provider: provider.name, providerEventId: identity.eventId } },
      select: { id: true, processedAt: true },
    });
  });
  // The job's id is the event's, so a repeat queues nothing new; a repeat of an event whose first job was never
  // queued (the queue was down) queues it now.
  if (event.processedAt === null) {
    await queue.send(WEBHOOK_PROCESS_QUEUE, { webhookEventId: event.id }, { id: event.id });
  }
  return { status: 200 };
}
