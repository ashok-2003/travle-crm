// Processes one stored webhook event in the worker, through its provider's handler, at least once however often it was
// delivered: repeated deliveries and job retries are collapsed, but the handler and the mark-processed update are
// separate transactions, so a crash between them runs the handler again. Handlers must be idempotent.
import type { Database } from "@travel-crm/db";
import type { JobData } from "@travel-crm/integrations/jobs";
import type { StoredWebhookEvent, WebhookProvider } from "./provider.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ERROR_LENGTH = 100;

export interface ProcessWebhookDependencies {
  db: Pick<Database, "withoutOrg">;
  providers: readonly WebhookProvider[];
}

export type WebhookProcessResult = "processed" | "already-processed" | "event-not-found";

/** The kept headers as stored: a JSON object of strings. */
function headersFrom(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/**
 * What is kept of a failure in the table: the error's code or name, never its message (messages quote payloads, and
 * payloads hold personal data). The full error is rethrown, to the logs and the job queue.
 */
function errorLabel(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const label = typeof code === "string" && code !== "" ? code : error instanceof Error ? error.name : "UnknownError";
  return label.slice(0, MAX_ERROR_LENGTH);
}

/**
 * Runs the provider's handler for a stored event and marks it processed. A failure is recorded on the event
 * (attempts, last_error: the error's name or code only) and rethrown, so the job is retried with backoff.
 */
export async function processWebhookEvent(
  { db, providers }: ProcessWebhookDependencies,
  webhookEventId: string,
): Promise<WebhookProcessResult> {
  if (!UUID_PATTERN.test(webhookEventId)) return "event-not-found";
  const row = await db.withoutOrg((tx) => tx.webhookEvent.findUnique({ where: { id: webhookEventId } }));
  if (!row) return "event-not-found";
  if (row.processedAt) return "already-processed";
  const provider = providers.find((candidate) => candidate.name === row.provider);
  // Thrown, not skipped: the provider may be missing only until a deploy brings it, and the job retries.
  if (!provider) throw new Error(`No webhook provider named ${row.provider} is registered`);

  const event: StoredWebhookEvent = {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    eventType: row.eventType,
    receivedAt: row.receivedAt,
    headers: headersFrom(row.headers),
    payload: row.payload,
    attempts: row.attempts,
  };
  try {
    await provider.process(event);
  } catch (error) {
    try {
      await db.withoutOrg((tx) =>
        tx.webhookEvent.update({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, lastError: errorLabel(error) },
        }),
      );
    } catch {
      // Recording failed too; the provider's error is the one worth seeing, so it travels as the cause.
      throw new Error("A webhook event failed, and so did recording the failure", { cause: error });
    }
    throw error;
  }
  await db.withoutOrg((tx) =>
    tx.webhookEvent.updateMany({
      where: { id: row.id, processedAt: null },
      data: { processedAt: new Date(), attempts: { increment: 1 }, lastError: null },
    }),
  );
  return "processed";
}

/** The handler for a webhooks.process job, whose data is `{ webhookEventId }`. */
export async function processWebhookJob(
  dependencies: ProcessWebhookDependencies,
  data: JobData,
): Promise<WebhookProcessResult> {
  const { webhookEventId } = data;
  if (typeof webhookEventId !== "string") throw new Error("A webhooks.process job needs a webhookEventId");
  return processWebhookEvent(dependencies, webhookEventId);
}
