// How many invite emails one address gets (ADR 0022), counted apart from plan 3's password resets: anyone may ask for
// resets to an address, but only platform staff ask for invites, each recorded, so resets can never use invites up.
import { ownMessages } from "@travel-crm/integrations/jobs";
import type { RateLimitRule } from "../rate-limits/index.js";

/**
 * Invite emails one address gets at most: five an hour, every attempt counted, so a failed send's retries have room.
 * Counted in Postgres, so every worker counts against the same limit.
 */
export const INVITES_PER_RECIPIENT: RateLimitRule = { limit: 5, windowSeconds: 60 * 60 };

/** The rate-limit key of one recipient's invites. Plan 3's resets count under their own, password-reset-recipient. */
export function inviteRecipientKey(address: string): string {
  return `staff-invite-recipient:${address.toLowerCase()}`;
}

/**
 * An invite past its address's cap. The job fails with it, never quietly: after its retries it stays in the failed
 * jobs, where support sees it and retries it once the hour is out. Ids only, so the message is kept.
 */
export class InviteCapReachedError extends Error {
  static {
    ownMessages(this);
  }

  constructor(memberId: string) {
    super(
      `Invite to member ${memberId} not sent: its address has had ${String(INVITES_PER_RECIPIENT.limit)} invite ` +
        "attempts this hour. Retry the job later.",
    );
    this.name = "InviteCapReachedError";
  }
}
