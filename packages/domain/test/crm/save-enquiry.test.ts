// The one save path for an enquiry (bulk plan, Task 1.1; N7): the form's and an import's rows make the same person,
// lead and timeline; an import adds to an open lead without asking, tells nobody unless asked, dates a lead from its
// enquiry date and leaves one past New without a first reply.
import { randomUUID } from "node:crypto";
import type { LeadSource, TripInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { saveEnquiry, type Enquiry, type EnquiryOptions } from "../../src/crm/save-enquiry.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, freshPhone } from "./support/records.js";

const noTrip: TripInput = {
  destination: null,
  when: { kind: "unknown" },
  adults: null,
  childrenAges: [],
  budget: null,
  departureCity: null,
  tripType: null,
  hotelCategory: null,
  food: null,
  roomType: null,
};

describe("saving an enquiry", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let importer: MemberAccess;
  let asha: string;
  const now = new Date("2026-10-19T10:00:00.000Z");

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const enquiry = (phone: string, overrides: Partial<Enquiry> = {}): Enquiry => ({
    person: { name: "Rahul Sharma", phone },
    trip: noTrip,
    note: null,
    source: "bulk_upload" satisfies LeadSource,
    sourceDetail: "enquiries.csv",
    ...overrides,
  });
  const fromImport = (overrides: Partial<Extract<EnquiryOptions, { from: "import" }>> = {}): EnquiryOptions => ({
    from: "import",
    ownerUserId: asha,
    stage: "new",
    createdAt: null,
    ...overrides,
  });
  const save = (input: Enquiry, options: EnquiryOptions) =>
    inOrg((tx) => saveEnquiry(tx, importer, input, now, options));
  const timelineOf = (leadId: string) =>
    inOrg(async (tx) =>
      (await tx.leadTimelineEntry.findMany({ where: { leadId }, orderBy: { id: "asc" } })).map((entry) => [
        entry.kind,
        entry.occurredAt.toISOString(),
      ]),
    );
  const toldAbout = (leadId: string) => inOrg((tx) => tx.notification.count({ where: { link: `/leads/${leadId}` } }));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Saving enquiries");
    importer = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    asha = randomUUID();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("gives the form and an import the same person, lead and timeline for the same enquiry", async () => {
    const input = (phone: string) => enquiry(phone, { note: "Wants a houseboat", source: "phone_call" });
    const byForm = await save(input(freshPhone()), {
      from: "form",
      ownerUserId: importer.userId,
      whenOpenLead: null,
    });
    const byImport = await save(input(freshPhone()), fromImport({ ownerUserId: importer.userId }));
    expect(byForm).toMatchObject({ outcome: "created", returning: false, leadOwnerUserId: importer.userId });
    expect(byImport).toMatchObject({ outcome: "created", returning: false, leadOwnerUserId: importer.userId });
    const shapeOf = (leadId: string) =>
      inOrg(async (tx) => {
        const lead = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
        const person = await tx.person.findUniqueOrThrow({ where: { id: lead.personId } });
        const notes = await tx.leadNote.findMany({ where: { leadId } });
        return {
          lead: [lead.stage, lead.source, lead.ownerUserId, lead.returning, lead.firstReplyAt],
          person: person.name,
          notes: notes.map((note) => note.body),
          timeline: (await tx.leadTimelineEntry.findMany({ where: { leadId }, orderBy: { id: "asc" } })).map(
            (entry) => entry.kind,
          ),
        };
      });
    expect(await shapeOf(byImport.leadId)).toEqual(await shapeOf(byForm.leadId));
  });

  it("adds an import's row for a person with an open lead as a repeat enquiry, without asking", async () => {
    const lead = await inOrg(async (tx) => {
      const person = await aPerson(tx, { phoneE164: freshPhone() });
      return { person, lead: await aLead(tx, { personId: person.id, ownerUserId: asha }) };
    });
    const phone = await inOrg(
      async (tx) => (await tx.person.findUniqueOrThrow({ where: { id: lead.person.id } })).phoneE164 ?? "",
    );
    const saved = await save(enquiry(phone, { note: "Asked again" }), fromImport());
    expect(saved).toMatchObject({
      outcome: "added-to-open-lead",
      leadId: lead.lead.id,
      personId: lead.person.id,
      leadOwnerUserId: asha,
    });
    const enquiries = await inOrg((tx) => tx.leadEnquiry.findMany({ where: { leadId: lead.lead.id } }));
    expect(enquiries.map((row) => [row.source, row.note])).toEqual([["bulk_upload", "Asked again"]]);
  });

  it("marks a known person with no open lead returning", async () => {
    const phone = freshPhone();
    await inOrg(async (tx) => {
      const person = await aPerson(tx, { phoneE164: phone });
      await aLead(tx, { personId: person.id, stage: "won" });
    });
    const saved = await save(enquiry(phone), fromImport());
    expect(saved).toMatchObject({ outcome: "created", returning: true });
  });

  it("sends no 'New lead assigned to you' or 'Repeat enquiry on your lead' for an import", async () => {
    const created = await save(enquiry(freshPhone()), fromImport());
    expect(await toldAbout(created.leadId)).toBe(0);
    const phone = await inOrg(
      async (tx) => (await tx.person.findUniqueOrThrow({ where: { id: created.personId } })).phoneE164 ?? "",
    );
    await save(enquiry(phone), fromImport());
    expect(await toldAbout(created.leadId)).toBe(0);
  });

  it("tells the owner of each lead and repeat enquiry when asked to (notify: each)", async () => {
    const created = await save(enquiry(freshPhone()), fromImport({ notify: "each" }));
    expect(await toldAbout(created.leadId)).toBe(1);
    const phone = await inOrg(
      async (tx) => (await tx.person.findUniqueOrThrow({ where: { id: created.personId } })).phoneE164 ?? "",
    );
    await save(enquiry(phone), fromImport({ notify: "each" }));
    expect(await toldAbout(created.leadId)).toBe(2);
  });

  it("dates an imported lead from its enquiry date, and its timeline from the import", async () => {
    const enquiryDate = new Date("2026-10-11T18:30:00.000Z");
    const saved = await save(
      enquiry(freshPhone(), { note: "Kashmir in December" }),
      fromImport({ createdAt: enquiryDate, stage: "contacted" }),
    );
    const lead = await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: saved.leadId } }));
    expect([lead.createdAt, lead.stageChangedAt, lead.stage]).toEqual([enquiryDate, enquiryDate, "contacted"]);
    expect(await timelineOf(saved.leadId)).toEqual([
      ["created", now.toISOString()],
      ["note", now.toISOString()],
      ["reassigned", now.toISOString()],
    ]);
  });

  it("leaves an imported lead past New without a first reply", async () => {
    const saved = await save(enquiry(freshPhone()), fromImport({ stage: "quote_sent" }));
    const lead = await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: saved.leadId } }));
    expect([lead.stage, lead.firstReplyAt]).toEqual(["quote_sent", null]);
  });
});
