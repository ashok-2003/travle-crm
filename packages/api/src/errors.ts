// How errors reach the client (spec 9.7): each domain error code becomes a tRPC status, and the response carries the
// code and reason the web app turns into a translated message. Unexpected errors never show their own message.
import { TRPCError, type TRPCDefaultErrorShape } from "@trpc/server";
import { DomainError, type DomainErrorCode } from "@travel-crm/domain/kernel";

const trpcCodeOf: Record<DomainErrorCode, TRPCError["code"]> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  LIMIT_REACHED: "FORBIDDEN",
  FEATURE_LOCKED: "FORBIDDEN",
  VALIDATION: "BAD_REQUEST",
};

/** The tRPC error for a domain error, keeping it as the cause so the formatter can read its code and reason. */
export function toTrpcError(error: DomainError): TRPCError {
  return new TRPCError({ code: trpcCodeOf[error.code], message: error.message, cause: error });
}

/**
 * The middleware every procedure starts with, the api's and the console's: a domain error thrown below it becomes its
 * tRPC status.
 */
export async function domainErrorsAsStatus<R extends { ok: boolean; error?: { cause?: unknown } }>({
  next,
}: {
  next: () => Promise<R>;
}): Promise<R> {
  const result = await next();
  if (!result.ok && result.error?.cause instanceof DomainError) throw toTrpcError(result.error.cause);
  return result;
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

/**
 * The error every tRPC response carries, the api's and the console's: an allow-list, so a field tRPC adds later can't
 * reach clients by being spread in.
 */
export function errorShape({ shape, error }: { shape: TRPCDefaultErrorShape; error: TRPCError }) {
  return {
    ...shape,
    message: publicMessage(error),
    data: {
      code: shape.data.code,
      httpStatus: shape.data.httpStatus,
      ...(shape.data.path === undefined ? {} : { path: shape.data.path }),
      ...errorDetails(error),
    },
  };
}
