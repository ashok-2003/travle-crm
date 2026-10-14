// Typed errors the domain throws (spec 9.7). The API turns each code into an HTTP and tRPC status.

export type DomainErrorCode =
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "LIMIT_REACHED" | "FEATURE_LOCKED" | "VALIDATION";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** A machine-readable detail such as "LAST_OWNER", from which the web app picks a translated message. */
  readonly reason: string;

  constructor(code: DomainErrorCode, reason: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.reason = reason;
  }
}
