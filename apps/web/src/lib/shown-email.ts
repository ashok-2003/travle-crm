// The one check that keeps the placeholder address of staff without email (ADR 0006) off every screen. It is the
// contracts' own rule, so the app and the api agree on what a placeholder is. The api never sends one; screens check
// again, because one shown would look like a real address to write to.
import { shownEmailAddress } from "@travel-crm/contracts/identity";

/** email when it is a real address a person may see, else null. */
export function shownEmail(email: string | null): string | null {
  return email !== null && shownEmailAddress.safeParse(email).success ? email : null;
}
