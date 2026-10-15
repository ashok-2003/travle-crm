// What the api said when it refused a call: its HTTP status and the domain reason (spec 9.7), read from a tRPC error.
import type { AppRouter } from "@travel-crm/api";
import { TRPCClientError } from "@trpc/client";

export interface ApiRefusal {
  /** The HTTP status, e.g. 403. */
  status: number;
  /** The domain reason, e.g. "MISSING_PERMISSION" or "SET_UP_TWO_FACTOR", or null. */
  reason: string | null;
}

/** The refusal in a failed call, or null when the call never got an answer (offline, the api down). */
export function refusalOf(error: unknown): ApiRefusal | null {
  if (!(error instanceof TRPCClientError)) return null;
  const data = (error as TRPCClientError<AppRouter>).data;
  if (!data) return null;
  return { status: data.httpStatus, reason: data.reason };
}

/** A refusal is the api's answer: trying again gives the same one. Only unanswered calls and server faults retry. */
export function isWorthRetrying(error: unknown): boolean {
  const refusal = refusalOf(error);
  return refusal === null || refusal.status >= 500;
}
