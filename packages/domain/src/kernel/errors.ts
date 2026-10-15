// Typed errors the domain throws (spec 9.7). The API turns each code into an HTTP and tRPC status.

export type DomainErrorCode =
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "LIMIT_REACHED" | "FEATURE_LOCKED" | "VALIDATION";

/**
 * The registry key that marks an error whose message our own code wrote, so a failed job's stored error keeps it
 * (masked). It is the key ownMessages in @travel-crm/integrations/jobs reads; the kernel can't import that (it stays
 * browser-safe), so the string is written in both places and a test checks they agree.
 */
export const OWN_MESSAGE_KEY = "@travel-crm/own-message";

export class DomainError extends Error {
  static {
    // Its messages are ours, written for the person using the app.
    Object.defineProperty(this.prototype, Symbol.for(OWN_MESSAGE_KEY), { value: true });
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
