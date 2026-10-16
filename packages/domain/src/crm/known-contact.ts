// The known-contact check (spec 3.2): who a phone, email or handle belongs to, their newest open lead (its id only
// when the asker can see it, R24), and whether any contact given is blocked (R33). Release 1's Task C1 builds it.
import type { KnownContactResult, PersonContacts } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** The person the contacts match, by phone, then email, then handle (R4), or null; the router adds the names. */
export const findKnownContact: (
  tx: OrgTx,
  access: MemberAccess,
  contacts: PersonContacts,
) => Promise<Omit<KnownContactResult, "people">> = () => {
  throw new Error("Not built yet: release 1 plan, Task C1");
};
