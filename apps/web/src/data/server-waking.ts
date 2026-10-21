// The pilot's free hosting sleeps after 15 quiet minutes and takes about a minute to wake (docs/serverless.md). While
// it wakes, calls go unanswered or come back as the proxy's 502, 503 or 504. These tell such a failure from the api's
// own answer, so a gate keeps trying for about WAKE_BUDGET_MS, saying it is starting up, before it says it failed.
import { isWorthRetrying, refusalOf } from "./api-error";

/** How long a gate or a sign-in waits for a sleeping server before giving up. */
export const WAKE_BUDGET_MS = 90_000;
export const WAKE_RETRY_DELAY_MS = 3_000;

const gatewayStatuses = new Set([502, 503, 504]);

/** An HTTP status (0 for no answer at all) that means the server is still waking, not that it refused. */
export function isWakingStatus(status: number): boolean {
  return status === 0 || gatewayStatuses.has(status);
}

/** A failed tRPC call that got no answer, or only the proxy's: a reason of ours means the api itself answered. */
export function isServerWaking(error: unknown): boolean {
  const refusal = refusalOf(error);
  return refusal === null || (refusal.reason === null && gatewayStatuses.has(refusal.status));
}

/**
 * Query options for a call a screen can't do without (who is signed in): it waits out a waking server at a steady pace,
 * and treats anything else as every query does (query-client.ts: two more tries for a server fault, none for a refusal).
 */
export const wakingRetry = {
  retry: (failures: number, error: unknown) =>
    isServerWaking(error) ? failures < WAKE_BUDGET_MS / WAKE_RETRY_DELAY_MS : failures < 2 && isWorthRetrying(error),
  retryDelay: (failures: number, error: unknown) =>
    isServerWaking(error) ? WAKE_RETRY_DELAY_MS : Math.min(1_000 * 2 ** failures, 30_000),
};
