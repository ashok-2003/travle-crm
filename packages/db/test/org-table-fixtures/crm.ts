// Isolation fixtures for the crm module: people, leads, a lead's timeline, notes and repeat enquiries, and blocked
// contacts. People, leads and blocked contacts are soft-deleted; the timeline is append-only for the runtime role, and
// it can't delete notes or repeat enquiries either: only the platform's erasure removes them.
import { randomUUID } from "node:crypto";
import type { OrgTx } from "../../src/for-org.js";
import type { OrgTableFixtures } from "../org-table-fixture.js";

/** A person with a contact no other fixture uses, since every fixture may run in one organization. */
const aPerson = (tx: OrgTx) =>
  tx.person.create({ data: { name: "Isolation person", email: `isolation-${randomUUID()}@example.test` } });

const aLead = async (tx: OrgTx) => tx.lead.create({ data: { personId: (await aPerson(tx)).id, source: "walk_in" } });

export const fixtures: OrgTableFixtures = {
  person: { create: aPerson },
  lead: { create: aLead },
  lead_timeline_entry: {
    create: async (tx) => tx.leadTimelineEntry.create({ data: { leadId: (await aLead(tx)).id, kind: "created" } }),
    appendOnly: true,
  },
  lead_note: {
    create: async (tx) => tx.leadNote.create({ data: { leadId: (await aLead(tx)).id, body: "Isolation note" } }),
    undeletable: true,
  },
  lead_call: {
    create: async (tx) =>
      tx.leadCall.create({ data: { leadId: (await aLead(tx)).id, outcome: "spoke", note: "Isolation call" } }),
  },
  lead_enquiry: {
    create: async (tx) => tx.leadEnquiry.create({ data: { leadId: (await aLead(tx)).id, source: "referral" } }),
    undeletable: true,
  },
  person_consent: {
    create: async (tx) =>
      tx.personConsent.create({
        data: {
          personId: (await aPerson(tx)).id,
          purpose: "marketing",
          action: "granted",
          wording: "Isolation wording",
          wordingVersion: 1,
          source: "staff",
        },
      }),
    appendOnly: true,
  },
  blocked_contact: {
    create: (tx) =>
      tx.blockedContact.create({ data: { kind: "email", value: `blocked-${randomUUID()}@example.test` } }),
  },
};
