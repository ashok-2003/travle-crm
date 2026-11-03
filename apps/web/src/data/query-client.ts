// The app's TanStack Query cache (spec 11): queries stay fresh for 30 seconds (slow-changing data for ten minutes) and refresh in the background when the
// window regains focus or the device reconnects; a refusal is never retried. Two refusals change where the person
// is: a 401 (the session ended) and a pending step (a password change or two-factor setup the api insists on).
import type { PendingStep } from "@travel-crm/contracts/identity";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isWorthRetrying, refusalOf } from "./api-error";

const DAY = 24 * 60 * 60 * 1000;

/** How long slow-changing data stays fresh: a console change reaches the app within this, an in-app change at once. */
export const SLOW_DATA_STALE_MS = 10 * 60_000;

/**
 * The tRPC paths whose answers change rarely (a role, the plan, the logo, a setting). Each is kept fresh for
 * SLOW_DATA_STALE_MS and not asked again on window focus; the app's own changes invalidate them, so they show at once.
 * The console's (whoAmI, plans, platform staff) are here too: its query client is built by this function.
 */
export const SLOW_DATA: readonly string[] = [
  "me.get",
  "subscription.get",
  "roles.list",
  "staff.list",
  "leads.owners",
  "settings.get",
  "quotes.settings",
  "inbox.status",
  "inbox.tags",
  "usage.welcome",
  "me.ownPassword",
  "organization.setup.get",
  "whoAmI",
  "plans.list",
  "plans.policy",
  "platformStaff.list",
];

export interface RefusalHandlers {
  /** The session is gone: the person must sign in again. */
  onSignedOut: () => void;
  /** The api wants this done before anything else. */
  onPendingStep: (step: PendingStep) => void;
}

/** Where a refusal takes the person: to sign in (a 401), to a pending step, or nowhere (the screen says why). */
export function refusalDestination(error: unknown): "sign-in" | PendingStep | null {
  const refusal = refusalOf(error);
  if (refusal?.status === 401) return "sign-in";
  if (refusal?.reason === "CHANGE_PASSWORD" || refusal?.reason === "SET_UP_TWO_FACTOR") return refusal.reason;
  return null;
}

export function handleRefusal(error: unknown, handlers: RefusalHandlers): void {
  const destination = refusalDestination(error);
  if (destination === "sign-in") handlers.onSignedOut();
  else if (destination) handlers.onPendingStep(destination);
}

export function createQueryClient(handlers: RefusalHandlers): QueryClient {
  const onError = (error: unknown) => {
    handleRefusal(error, handlers);
  };
  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Kept for a day, as long as the copy in IndexedDB, so the last lists show on a weak connection.
        gcTime: DAY,
        retry: (failures, error) => failures < 2 && isWorthRetrying(error),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: { retry: false },
    },
  });
  // tRPC keys are [path segments, ...]; a default on the path segments covers every input the procedure is asked with.
  for (const path of SLOW_DATA) {
    client.setQueryDefaults([path.split(".")], { staleTime: SLOW_DATA_STALE_MS, refetchOnWindowFocus: false });
  }
  return client;
}

export const QUERY_CACHE_MAX_AGE = DAY;
