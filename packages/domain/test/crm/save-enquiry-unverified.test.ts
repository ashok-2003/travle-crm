// An unverified enquiry (website form W18): the phone alone finds the person, nobody who exists is changed, and an email
// the person doesn't have, or another holds, goes into the note instead. The verified paths still fill missing contacts.
import { randomUUID } from "node:crypto";
import type { TripInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publicActor } from "../../src/kernel/index.js";
import { saveEnquiry, type Enquiry, type EnquiryOptions } from "../../src/crm/save-enquiry.js";
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

describe("saving an unverified enquiry", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: string;
  const now = new Date("2026-10-22T10:00:00.000Z");
  const visitor = () => publicActor(organizationId);

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const enquiry = (phone: string, overrides: Partial<Enquiry["person"]> = {}, note: string | null = null): Enquiry => ({
    person: { name: "Visitor Name", phone, ...overrides },
    trip: noTrip,
    note,
    source: "web_form",
    sourceDetail: "Hosted link",
  });
  const unverified = (): EnquiryOptions => ({
    from: "import",
    ownerUserId: owner,
    stage: "new",
    createdAt: null,
    notify: "each",
    unverified: true,
  });
  const saveAsVisitor = (input: Enquiry) => inOrg((tx) => saveEnquiry(tx, visitor(), input, now, unverified()));
  const personNamed = (phone: string) => inOrg((tx) => tx.person.findFirstOrThrow({ where: { phoneE164: phone } }));
  const notesOf = (leadId: string) =>
    inOrg(async (tx) => (await tx.leadNote.findMany({ where: { leadId } })).map((note) => note.body));
  const enquiryNotesOf = (leadId: string) =>
    inOrg(async (tx) => (await tx.leadEnquiry.findMany({ where: { leadId } })).map((row) => row.note));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Unverified enquiries");
    owner = randomUUID();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("adds no contact to an existing person and puts a differing email in the note", async () => {
    const phone = freshPhone();
    const person = await inOrg((tx) => aPerson(tx, { name: "Asha Rao", phoneE164: phone, email: "asha@example.test" }));
    await inOrg((tx) => aLead(tx, { personId: person.id, ownerUserId: owner, stage: "won" }));
    const saved = await saveAsVisitor(enquiry(phone, { name: "Someone Else", email: "other@example.test" }, "Hello"));
    expect(saved).toMatchObject({ outcome: "created", returning: true, leftOut: { email: "other@example.test" } });
    expect(await personNamed(phone)).toMatchObject({
      name: "Asha Rao",
      email: "asha@example.test",
      instagramHandle: null,
    });
    expect(await notesOf(saved.leadId)).toEqual(["Hello\nEmail given: other@example.test"]);
    expect(await inOrg((tx) => tx.auditEntry.count({ where: { action: "person.edited", entityId: person.id } }))).toBe(
      0,
    );
  });

  it("does not fill an email the existing person lacks, and notes it", async () => {
    const phone = freshPhone();
    await inOrg((tx) => aPerson(tx, { name: "No Email", phoneE164: phone }));
    const saved = await saveAsVisitor(enquiry(phone, { email: "given@example.test" }));
    expect(saved.leftOut).toEqual({ email: "given@example.test" });
    expect((await personNamed(phone)).email).toBeNull();
    expect(await notesOf(saved.leadId)).toEqual(["Email given: given@example.test"]);
  });

  it("says nothing of an email the person already has", async () => {
    const phone = freshPhone();
    await inOrg((tx) => aPerson(tx, { phoneE164: phone, email: "same@example.test" }));
    const saved = await saveAsVisitor(enquiry(phone, { email: "same@example.test" }, "Hi"));
    expect(saved.leftOut).toEqual({ email: null });
    expect(await notesOf(saved.leadId)).toEqual(["Hi"]);
  });

  it("a held email is left out of a new person and noted", async () => {
    const heldEmail = `held-${randomUUID()}@example.test`;
    await inOrg((tx) => aPerson(tx, { phoneE164: freshPhone(), email: heldEmail }));
    const phone = freshPhone();
    const saved = await saveAsVisitor(enquiry(phone, { email: heldEmail }));
    expect(saved.leftOut).toEqual({ email: heldEmail });
    expect((await personNamed(phone)).email).toBeNull();
    expect(await notesOf(saved.leadId)).toEqual([`Email given: ${heldEmail}`]);
  });

  it("a free email is kept on a new person", async () => {
    const phone = freshPhone();
    const email = `free-${randomUUID()}@example.test`;
    const saved = await saveAsVisitor(enquiry(phone, { email }));
    expect(saved.leftOut).toEqual({ email: null });
    expect((await personNamed(phone)).email).toBe(email);
  });

  it("is matched by phone alone, not by an email another person holds", async () => {
    const holder = `holder-${randomUUID()}@example.test`;
    const holderPerson = await inOrg((tx) =>
      aPerson(tx, { name: "Email Holder", phoneE164: freshPhone(), email: holder }),
    );
    const phone = freshPhone();
    const saved = await saveAsVisitor(enquiry(phone, { email: holder }));
    expect(saved.personId).not.toBe(holderPerson.id);
    expect(saved.returning).toBe(false);
  });

  it("puts a differing email in the note of a repeat enquiry on an open lead", async () => {
    const phone = freshPhone();
    const person = await inOrg((tx) => aPerson(tx, { phoneE164: phone, email: "a@example.test" }));
    const lead = await inOrg((tx) => aLead(tx, { personId: person.id, ownerUserId: owner }));
    const saved = await saveAsVisitor(enquiry(phone, { email: "b@example.test" }, "Again"));
    expect(saved).toMatchObject({ outcome: "added-to-open-lead", leadId: lead.id });
    expect(await enquiryNotesOf(lead.id)).toEqual(["Again\nEmail given: b@example.test"]);
  });

  it("the verified paths (form, import, sheets) still fill missing contacts", async () => {
    const phone = freshPhone();
    await inOrg((tx) => aPerson(tx, { name: "Verified", phoneE164: phone }));
    const admin = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    const email = `verified-${randomUUID()}@example.test`;
    const saved = await inOrg((tx) =>
      saveEnquiry(tx, admin, enquiry(phone, { email }), now, {
        from: "import",
        ownerUserId: owner,
        stage: "new",
        createdAt: null,
      }),
    );
    expect(saved.leftOut).toEqual({ email: null });
    expect((await personNamed(phone)).email).toBe(email);
  });

  it("createdBy is null for the public actor", async () => {
    const saved = await saveAsVisitor(enquiry(freshPhone()));
    const lead = await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: saved.leadId } }));
    const person = await inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: saved.personId } }));
    expect(lead.createdBy).toBeNull();
    expect(person.createdBy).toBeNull();
  });

  it("records its audit entries with the source public", async () => {
    const saved = await saveAsVisitor(enquiry(freshPhone()));
    const entries = await inOrg((tx) =>
      tx.auditEntry.findMany({ where: { entityId: { in: [saved.leadId, saved.personId] } } }),
    );
    expect(entries.map((entry) => entry.action).sort()).toEqual(["lead.added", "person.added"]);
    expect(entries.every((entry) => entry.source === "public" && entry.actorUserId === null)).toBe(true);
  });

  it("tells the owner once of a new lead", async () => {
    const saved = await saveAsVisitor(enquiry(freshPhone()));
    expect(
      await inOrg((tx) => tx.notification.count({ where: { link: `/leads/${saved.leadId}`, recipientUserId: owner } })),
    ).toBe(1);
  });
});
