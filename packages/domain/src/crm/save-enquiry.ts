// The one save path for an enquiry, the new-lead form's and an import row's (bulk plan, Task 1.1): match the person,
// fill the contacts they lack, find their open lead, then a repeat enquiry on it or a new lead (returning when the
// person is known). The form passes its answer about an open lead; an import always adds to it, tells nobody unless
// asked, and dates and stages the lead it makes.
import type { LeadSource, LeadStage, NewPerson, TripInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { addLeadInTransaction } from "./add-lead.js";
import { notifyLeadAssigned } from "./lead-core.js";
import { addPerson, fillMissingContacts, matchPerson, newestOpenLead } from "./people.js";
import { addRepeatEnquiry } from "./repeat-enquiry.js";
import { resolveTrip } from "./trip-columns.js";

export interface Enquiry {
  person: NewPerson;
  trip: TripInput;
  note: string | null;
  source: LeadSource;
  sourceDetail: string | null;
}

export type EnquiryOptions =
  | { from: "form"; ownerUserId: string; whenOpenLead: "add-to-it" | "new-lead" | null }
  | {
      from: "import";
      ownerUserId: string;
      stage: LeadStage;
      /** The enquiry date as an instant, or null for now. */
      createdAt: Date | null;
      /** Whether each owner is told as the form tells them; an import tells nobody (B18), a sheet's row each. */
      notify?: "each" | "none";
    };

export interface SavedEnquiry {
  outcome: "created" | "added-to-open-lead";
  leadId: string;
  personId: string;
  returning: boolean;
  /** The owner of the lead the enquiry is on: the new lead's, or the open lead's (null when it has none). */
  leadOwnerUserId: string | null;
}

/** Saves the enquiry in the transaction. Whether the actor may see the lead it lands on is the caller's to decide. */
export async function saveEnquiry(
  tx: OrgTx,
  access: MemberAccess,
  enquiry: Enquiry,
  now: Date,
  options: EnquiryOptions,
): Promise<SavedEnquiry> {
  const fromForm = options.from === "form";
  const notifyOwner = fromForm || options.notify === "each";
  const found = await matchPerson(tx, enquiry.person);
  if (found !== null) {
    await fillMissingContacts(tx, access, found.person, enquiry.person);
    const open = await newestOpenLead(tx, found.person.id);
    if (open !== null && fromForm && options.whenOpenLead === null) {
      throw new DomainError("CONFLICT", "OPEN_LEAD_EXISTS", "This person already has an open lead");
    }
    if (open !== null && (!fromForm || options.whenOpenLead === "add-to-it")) {
      await addRepeatEnquiry(tx, access, { lead: open, personName: found.person.name, input: enquiry }, now, {
        notifyOwner,
      });
      return {
        outcome: "added-to-open-lead",
        leadId: open.id,
        personId: found.person.id,
        returning: open.returning,
        leadOwnerUserId: open.ownerUserId,
      };
    }
  }
  const person = found?.person ?? (await addPerson(tx, access, enquiry.person));
  const trip = await resolveTrip(tx, access, enquiry.trip);
  const returning = found !== null && (await tx.lead.count({ where: { personId: person.id } })) > 0;
  const imported = options.from === "import";
  const { leadId } = await addLeadInTransaction(
    tx,
    access,
    {
      personId: person.id,
      trip,
      returning,
      ownerUserId: options.ownerUserId,
      source: enquiry.source,
      sourceDetail: enquiry.sourceDetail,
      note: enquiry.note,
      createdBy: access.userId,
      ...(imported
        ? { stage: options.stage, recordedAt: now, ...(options.createdAt ? { createdAt: options.createdAt } : {}) }
        : {}),
    },
    now,
  );
  if (notifyOwner && options.ownerUserId !== access.userId) {
    await notifyLeadAssigned(tx, access, { leadId, ownerUserId: options.ownerUserId });
  }
  return { outcome: "created", leadId, personId: person.id, returning, leadOwnerUserId: options.ownerUserId };
}
