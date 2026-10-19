// A customer's contacts as stored, read before an erasure empties them, so the sheets' tombstones can be made (S43).
import type { OrgTx } from "@travel-crm/db";
import { withDeleted } from "@travel-crm/db";
import type { CustomerSubject } from "./customer-erasure.js";

/** The contacts of the Sheets sync's tombstones: E.164 phones, lower-case emails, handles without "@". */
export interface CustomerContacts {
  phones: string[];
  emails: string[];
  instagramHandles: string[];
}

export async function customerContacts(tx: OrgTx, subject: CustomerSubject): Promise<CustomerContacts> {
  const { organizationId, personId } = subject;
  const person = await withDeleted(() =>
    tx.person.findFirst({
      where: { organizationId, id: personId },
      select: { phoneE164: true, email: true, instagramHandle: true },
    }),
  );
  return {
    phones: person?.phoneE164 == null ? [] : [person.phoneE164],
    emails: person?.email == null ? [] : [person.email],
    instagramHandles: person?.instagramHandle == null ? [] : [person.instagramHandle],
  };
}
