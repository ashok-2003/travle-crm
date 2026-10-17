// The known-contact check (spec 3.2): who a phone, email or handle belongs to, their newest open lead (its id only
// when the asker can see it, R24, so no client names a lead it can't see), and whether any contact given is blocked
// (R33). The new-lead form and the person editor both ask it before saving.
import type { KnownContactResult, PersonContacts } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { destinationNames } from "../catalog/index.js";
import type { MemberAccess } from "../identity/index.js";
import { isBlocked } from "./blocking.js";
import { isLeadInScope } from "./lead-detail.js";
import { matchPerson, newestOpenLead } from "./people.js";

/** The person the contacts match, by phone, then email, then handle (R4), or null; the router adds the names. */
export async function findKnownContact(
  tx: OrgTx,
  access: MemberAccess,
  contacts: PersonContacts,
): Promise<Omit<KnownContactResult, "people">> {
  const blocked = await isBlocked(tx, contacts);
  const found = await matchPerson(tx, contacts);
  if (found === null) return { match: null, blocked };
  const { person, matchedBy } = found;
  const open = await newestOpenLead(tx, person.id);
  const destinationId = open?.destinationId ?? null;
  const destinationName = destinationId === null ? null : await destinationNameOf(tx, destinationId);
  return {
    match: {
      personId: person.id,
      personName: person.name,
      matchedBy,
      openLead:
        open === null
          ? null
          : {
              leadId: isLeadInScope(access, open.ownerUserId) ? open.id : null,
              destinationName,
              ownerUserId: open.ownerUserId,
            },
    },
    blocked,
  };
}

async function destinationNameOf(tx: OrgTx, destinationId: string): Promise<string | null> {
  return (await destinationNames(tx, [destinationId])).get(destinationId) ?? null;
}
