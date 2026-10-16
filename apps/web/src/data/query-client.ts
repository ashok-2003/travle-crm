// The app's TanStack Query cache (spec 11): queries stay fresh for 30 seconds and refresh in the background when the
// window regains focus or the device reconnects; a refusal is never retried. Two refusals change where the person
// is: a 401 (the session ended) and a pending step (a password change or two-factor setup the api insists on).
import type { PendingStep } from "@travel-crm/contracts/identity";
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isWorthRetrying, refusalOf } from "./api-error";

const DAY = 24 * 60 * 60 * 1000;

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
  return new QueryClient({
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
}

export const QUERY_CACHE_MAX_AGE = DAY;
