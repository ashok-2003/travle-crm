// Processes one stored webhook event in the worker, through its provider's handler, at least once however often it was
// delivered: repeated deliveries and job retries are collapsed, but the handler and the mark-processed update are
// separate transactions, so a crash between them runs the handler again. Handlers must be idempotent.
import type { Database } from "@travel-crm/db";
import { webhookEvents } from "@travel-crm/db/webhooks";
import { describeError, ownMessage, type JobData } from "@travel-crm/integrations/jobs";
import { isUuid } from "../kernel/index.js";
import type { StoredWebhookEvent, WebhookProvider } from "./provider.js";

const MAX_ERROR_LENGTH = 100;

export interface ProcessWebhookDependencies {
  db: Pick<Database, "withoutOrg">;
  providers: readonly WebhookProvider[];
}

/** "tombstoned": its organization's purge blanked it before its handler finished, so there is nothing to process. */
export type WebhookProcessResult = "processed" | "already-processed" | "tombstoned" | "event-not-found";

/** The kept headers as stored: a JSON object of strings. */
function headersFrom(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

/**
 * What is kept of a failure in the table: the error's names and codes (describeError), never its message (messages
 * quote payloads, and payloads hold personal data). The error is rethrown: the job queue stores a cut-down copy and
 * the log its names and codes.
 */
function errorLabel(error: unknown): string {
  return describeError(error).slice(0, MAX_ERROR_LENGTH);
}

/**
 * The organization a handler found, as an update sets it: only once found, so a later attempt that doesn't say keeps
 * what an earlier one did.
 */
function resolvedOrganization(found: { organizationId: string | null }): { resolvedOrganizationId?: string } {
  return found.organizationId === null ? {} : { resolvedOrganizationId: found.organizationId };
}

/**
 * Runs the provider's handler for a stored event and marks it processed. A failure is recorded on the event
 * (attempts, last_error: the error's name or code only) and rethrown, so the job is retried with backoff. Either way the
 * event keeps the organization the handler found, so its purge finds it even while it is still being retried.
 */
export async function processWebhookEvent(
  { db, providers }: ProcessWebhookDependencies,
  webhookEventId: string,
): Promise<WebhookProcessResult> {
  if (!isUuid(webhookEventId)) return "event-not-found";
  const row = await db.withoutOrg((tx) => webhookEvents(tx).findUnique({ where: { id: webhookEventId } }));
  if (!row) return "event-not-found";
  if (row.processedAt) return "already-processed";
  if (row.tombstonedAt) return "tombstoned";
  const provider = providers.find((candidate) => candidate.name === row.provider);
  // Thrown, not skipped: the provider may be missing only until a deploy brings it, and the job retries.
  if (!provider) throw ownMessage(new Error(`No webhook provider named ${row.provider} is registered`));

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
  const found: { organizationId: string | null } = { organizationId: null };
  try {
    await provider.process(event, {
      isAbout: (id) => {
        // Thrown inside the handler, so it is recorded as the handler's failure. The message quotes no value: the
        // handler may have taken it from the payload.
        if (!isUuid(id)) throw ownMessage(new RangeError("isAbout takes an organization's id"));
        found.organizationId = id;
      },
    });
  } catch (error) {
    try {
      await db.withoutOrg((tx) =>
        webhookEvents(tx).update({
          where: { id: row.id },
          data: { attempts: { increment: 1 }, lastError: errorLabel(error), ...resolvedOrganization(found) },
        }),
      );
    } catch (recordingError) {
      // Both errors are kept, in one AggregateError whose own message quotes neither (messages may quote payloads).
      throw ownMessage(
        new AggregateError([error, recordingError], "A webhook event failed, and so did recording the failure", {
          cause: recordingError,
        }),
      );
    }
    throw error;
  }
  await db.withoutOrg((tx) =>
    webhookEvents(tx).updateMany({
      where: { id: row.id, processedAt: null },
      data: {
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: null,
        ...resolvedOrganization(found),
      },
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
  if (typeof webhookEventId !== "string") throw ownMessage(new Error("A webhooks.process job needs a webhookEventId"));
  return processWebhookEvent(dependencies, webhookEventId);
}
