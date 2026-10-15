// Typed errors the domain throws (spec 9.7). The API turns each code into an HTTP and tRPC status.
import { ownMessages } from "@travel-crm/integrations/jobs";

export type DomainErrorCode =
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "LIMIT_REACHED" | "FEATURE_LOCKED" | "VALIDATION";

export class DomainError extends Error {
  static {
    // Its messages are ours, written for the person using the app: a failed job's stored error keeps them (masked).
    ownMessages(this);
  }

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
