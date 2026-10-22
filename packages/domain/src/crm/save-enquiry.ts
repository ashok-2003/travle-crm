// The one save path for an enquiry, the new-lead form's and an import row's (bulk plan, Task 1.1): match the person,
// fill the contacts they lack, find their open lead, then a repeat enquiry on it or a new lead (returning when the
// person is known). The form passes its answer about an open lead; an import always adds to it, tells nobody unless
// asked, and dates and stages the lead it makes. An import whose owner is only the fallback (a row naming no one)
// has its new lead assigned by the agency's rules and mode instead (release C, assignment/choose-owner.ts). The website
// form's visitor is nobody signed in and nothing they typed is proved: it saves as a system actor, `unverified`.
import type { LeadSource, LeadStage, NewPerson, TripInput } from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { DomainError, type Actor } from "../kernel/index.js";
import { addLeadInTransaction } from "./add-lead.js";
import { chooseOwner } from "./assignment/index.js";
import { notifyLeadAssigned } from "./lead-core.js";
import { addPerson, fillMissingContacts, matchPerson, newestOpenLead, type PersonRow } from "./people.js";
import { addRepeatEnquiry } from "./repeat-enquiry.js";
import { resolveTrip } from "./trip-columns.js";

const MAX_NOTE_LENGTH = 4000;

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
      /**
       * Set when ownerUserId is only the fallback (the row named no one): a new lead is then assigned by the agency's
       * rules and mode, among these lead workers.
       */
      assign?: { workers: ReadonlySet<string> };
      /**
       * Nobody proved the phone or the email (the website form, W18): the person is found by phone alone, an existing
       * person is never changed, and an email that isn't theirs, or that another person holds, goes into the note.
       */
      unverified?: true;
      /** Where the enquiry came from, kept in the audit entries it makes (the website form's id, W24). */
      auditDetail?: { formId: string };
    };

export interface SavedEnquiry {
  outcome: "created" | "added-to-open-lead";
  leadId: string;
  personId: string;
  returning: boolean;
  /** The owner of the lead the enquiry is on: the new lead's, or the open lead's (null when it has none). */
  leadOwnerUserId: string | null;
  /** What an unverified enquiry gave that was kept off the person; already in the note. Always null otherwise. */
  leftOut: { email: string | null };
}

/** Saves the enquiry in the transaction. Whether the actor may see the lead it lands on is the caller's to decide. */
export async function saveEnquiry(
  tx: OrgTx,
  actor: Actor,
  enquiry: Enquiry,
  now: Date,
  options: EnquiryOptions,
): Promise<SavedEnquiry> {
  const fromForm = options.from === "form";
  const unverified = options.from === "import" && options.unverified === true;
  const notifyOwner = fromForm || options.notify === "each";
  const auditDetail = options.from === "import" ? options.auditDetail : undefined;
  const found = await matchPerson(tx, unverified ? { phone: enquiry.person.phone } : enquiry.person);
  const leftOut = {
    email: unverified ? await emailKeptOffPerson(tx, found?.person ?? null, enquiry.person.email) : null,
  };
  const input = leftOut.email === null ? enquiry : { ...enquiry, note: noteWithEmail(enquiry.note, leftOut.email) };
  if (found !== null) {
    if (!unverified) await fillMissingContacts(tx, actor, found.person, enquiry.person);
    const open = await newestOpenLead(tx, found.person.id);
    if (open !== null && fromForm && options.whenOpenLead === null) {
      throw new DomainError("CONFLICT", "OPEN_LEAD_EXISTS", "This person already has an open lead");
    }
    if (open !== null && (!fromForm || options.whenOpenLead === "add-to-it")) {
      await addRepeatEnquiry(tx, actor, { lead: open, personName: found.person.name, input }, now, {
        notifyOwner,
        ...(auditDetail ? { auditDetail } : {}),
      });
      return {
        outcome: "added-to-open-lead",
        leadId: open.id,
        personId: found.person.id,
        returning: open.returning,
        leadOwnerUserId: open.ownerUserId,
        leftOut,
      };
    }
  }
  const person =
    found?.person ??
    (await addPerson(
      tx,
      actor,
      leftOut.email === null ? enquiry.person : { ...enquiry.person, email: undefined },
      auditDetail ?? null,
    ));
  const trip = await resolveTrip(tx, actor, input.trip);
  const returning = found !== null && (await tx.lead.count({ where: { personId: person.id } })) > 0;
  const imported = options.from === "import";
  const ownerUserId =
    imported && options.assign
      ? await chooseOwner(
          tx,
          {
            source: input.source,
            destinationId: trip.destinationId,
            tripType: trip.tripType,
            previousOwnerUserId: returning ? await previousOwnerOf(tx, person.id) : null,
          },
          { workers: options.assign.workers, fallback: options.ownerUserId, now },
        )
      : options.ownerUserId;
  const { leadId } = await addLeadInTransaction(
    tx,
    actor,
    {
      personId: person.id,
      trip,
      returning,
      ownerUserId,
      source: input.source,
      sourceDetail: input.sourceDetail,
      note: input.note,
      createdBy: actor.userId,
      ...(auditDetail ? { auditDetail } : {}),
      ...(imported
        ? { stage: options.stage, recordedAt: now, ...(options.createdAt ? { createdAt: options.createdAt } : {}) }
        : {}),
    },
    now,
  );
  if (notifyOwner && ownerUserId !== null && ownerUserId !== actor.userId) {
    await notifyLeadAssigned(tx, actor, { leadId, ownerUserId });
  }
  return { outcome: "created", leadId, personId: person.id, returning, leadOwnerUserId: ownerUserId, leftOut };
}

/**
 * The email an unverified enquiry gave that stays off the person: any email an existing person doesn't have, or a new
 * person's email that another live person holds (W18). Null when there is none to leave out.
 */
async function emailKeptOffPerson(
  tx: OrgTx,
  existing: PersonRow | null,
  email: string | undefined,
): Promise<string | null> {
  if (email === undefined) return null;
  if (existing !== null) return existing.email === email ? null : email;
  return (await tx.person.findFirst({ where: { email }, select: { id: true } })) === null ? null : email;
}

/** The note with the email given on its own last line, cut to the note's 4,000 characters. */
function noteWithEmail(note: string | null, email: string): string {
  return [note, `Email given: ${email}`]
    .filter((part) => part !== null)
    .join("\n")
    .slice(0, MAX_NOTE_LENGTH);
}

/** Who owned the person's latest lead, for a returning customer. */
async function previousOwnerOf(tx: OrgTx, personId: string): Promise<string | null> {
  const latest = await tx.lead.findFirst({
    where: { personId },
    orderBy: { createdAt: "desc" },
    select: { ownerUserId: true },
  });
  return latest?.ownerUserId ?? null;
}
