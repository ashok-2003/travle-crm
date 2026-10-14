// How errors reach the client (spec 9.7): each domain error code becomes a tRPC status, and the response carries the
// code and reason the web app turns into a translated message. Unexpected errors never show their own message.
import { TRPCError } from "@trpc/server";
import { DomainError, type DomainErrorCode } from "@travel-crm/domain/kernel";

const trpcCodeOf: Record<DomainErrorCode, TRPCError["code"]> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  LIMIT_REACHED: "FORBIDDEN",
  FEATURE_LOCKED: "FORBIDDEN",
  VALIDATION: "BAD_REQUEST",
};

/** The HTTP status of each domain error code, for routes outside tRPC (share links, webhooks). Same as tRPC's. */
const httpStatusOf: Record<DomainErrorCode, 400 | 403 | 404 | 409> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  LIMIT_REACHED: 403,
  FEATURE_LOCKED: 403,
  VALIDATION: 400,
};

/** The response a plain HTTP route sends for a domain error: its status, and the code and reason to translate. */
export function domainErrorResponse(error: DomainError): Response {
  return Response.json(
    { code: error.code, reason: error.reason, message: error.message },
    { status: httpStatusOf[error.code] },
  );
}

/** The tRPC error for a domain error, keeping it as the cause so the formatter can read its code and reason. */
export function toTrpcError(error: DomainError): TRPCError {
  return new TRPCError({ code: trpcCodeOf[error.code], message: error.message, cause: error });
}

/** What the client sees about a failed call, beyond tRPC's code and status. */
export interface ErrorDetails {
  /** The domain error code, e.g. "FORBIDDEN", or null for errors that aren't domain errors. */
  domainCode: DomainErrorCode | null;
  /** The reason, e.g. "MISSING_PERMISSION" or "SET_UP_TWO_FACTOR", or null. */
  reason: string | null;
}

export function errorDetails(error: TRPCError): ErrorDetails {
  const cause = error.cause;
  return cause instanceof DomainError
    ? { domainCode: cause.code, reason: cause.reason }
    : { domainCode: null, reason: null };
}

/** Internal errors can carry SQL or file paths in their message; the client gets a generic one instead. */
export function publicMessage(error: TRPCError): string {
  return error.code === "INTERNAL_SERVER_ERROR" ? "Something went wrong" : error.message;
}
