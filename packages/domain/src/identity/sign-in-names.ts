// How sign-in names are stored. Usernames carry their organization code, so one Better Auth username table serves
// every organization; staff without email get a placeholder address, because Better Auth requires an email.

/** RFC 2606 reserves .invalid: no real mailbox can have one of these addresses. */
const PLACEHOLDER_DOMAIN = "no-email.invalid";

/** Better Auth's username validator: "<org code>:<username>", both lowercase. */
export const INTERNAL_USERNAME_PATTERN = /^[a-z0-9]{3,12}:[a-z0-9_.-]{2,32}$/;

/** The username Better Auth stores, e.g. "sharma:ravi". Unique across the product because org codes are. */
export function internalUsername(organizationCode: string, username: string): string {
  return `${organizationCode}:${username}`.toLowerCase();
}

/** The address of a person without email, e.g. "sharma-ravi@no-email.invalid". Never shown, never emailed. */
export function placeholderEmail(organizationCode: string, username: string): string {
  // Org codes are letters and digits only, so the first "-" separates code from username and the address is unique.
  return `${organizationCode}-${username}@${PLACEHOLDER_DOMAIN}`.toLowerCase();
}

/** The address a removed person's user row gets, which frees their real one (ADR 0007). */
export function removedPersonEmail(userId: string): string {
  return `removed-${userId}@${PLACEHOLDER_DOMAIN}`;
}

export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith(`@${PLACEHOLDER_DOMAIN}`);
}

/** The email to show for a user: null for placeholders. */
export function shownEmail(email: string): string | null {
  return isPlaceholderEmail(email) ? null : email;
}
