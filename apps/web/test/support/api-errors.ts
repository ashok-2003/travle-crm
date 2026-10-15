// tRPC errors as the client builds them from the api's answers, for tests of how the app reacts to refusals.
import { TRPCClientError } from "@trpc/client";

/** A refusal with the api's error shape: an HTTP status and, for domain errors, a reason. */
export function refusal(httpStatus: number, reason: string | null = null): TRPCClientError<never> {
  return TRPCClientError.from({
    error: {
      message: reason ?? "Refused",
      code: -32603,
      data: { code: "FORBIDDEN", httpStatus, domainCode: reason ? "FORBIDDEN" : null, reason },
    },
  });
}

/** A call that never got an answer, as when the device is offline. */
export function unanswered(): TRPCClientError<never> {
  return TRPCClientError.from(new TypeError("Failed to fetch"));
}
