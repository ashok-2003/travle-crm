// Erasing and exporting a customer (spec 7, ADR 0023, R38, R39): crm's part of a person's erasure, run on the
// platform's transaction as the console's job runs it. Their name and contacts go, they and their leads are
// soft-deleted with the trip facts kept, their leads' notes and repeat enquiries go with those timeline entries, and
// blocked contacts that held their phone, email or handle go; nobody else's rows change. The export before it holds
// their contacts and each lead's stage, trip, source, notes, enquiries and task titles.
import { randomUUID } from "node:crypto";
import { createDatabase, withDeleted, type Database, type OrgTx } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { eraseCustomer, exportCustomer } from "../../src/crm/index.js";
import { aLead, aPerson, aTask, freshPhone } from "../crm/support/records.js";

const at = (iso: string) => new Date(iso);

/** A customer with two leads, notes, a repeat enquiry, tasks, timeline entries and blocked contacts. */
async function aCustomer(tx: OrgTx, name: string) {
  const tag = randomUUID().slice(0, 8);
  const contacts = { phoneE164: freshPhone(), email: `${tag}@example.test`, instagramHandle: `traveller_${tag}` };
  const person = await aPerson(tx, { name, ...contacts });
  const destination = await tx.destination.create({ data: { name: `Kashmir ${tag}` } });
  const open = await tx.lead.create({
    data: {
      personId: person.id,
      stage: "contacted",
      destinationId: destination.id,
      travelKind: "month",
      travelMonth: at("2026-12-01T00:00:00Z"),
      adults: 2,
      childrenAges: [6],
      budgetPaise: 18_000_000n,
      budgetBasis: "per_person",
      tripType: "family",
      source: "referral",
      sourceDetail: `Referred by ${name}'s cousin`,
      createdAt: at("2026-10-01T05:00:00Z"),
    },
  });
  const won = await aLead(tx, { personId: person.id, stage: "won", returning: false });
  const note = (body: string) => tx.leadNote.create({ data: { leadId: open.id, body } });
  const notes = [await note(`${name} wants a houseboat`), await note("Prefers a morning call")];
  const enquiry = await tx.leadEnquiry.create({
    data: { leadId: open.id, travelKind: "flexible", adults: 4, source: "phone_call", note: `${name} asked again` },
  });
  const entry = (kind: string, record?: { recordType: string; recordId: string }) =>
    tx.leadTimelineEntry.create({ data: { leadId: open.id, kind, ...record } });
  await entry("created");
  for (const { id } of notes) await entry("note", { recordType: "lead_note", recordId: id });
  await entry("repeat-enquiry", { recordType: "lead_enquiry", recordId: enquiry.id });
  await tx.leadTimelineEntry.create({ data: { leadId: open.id, kind: "stage-changed", stage: "contacted" } });
  const onOpen = { recordType: "lead", recordId: open.id };
  const followUp = await aTask(tx, {
    kind: "follow-up",
    title: `Send ${name} the Kashmir quote`,
    record: onOpen,
    dueAt: at("2026-10-20T05:00:00Z"),
  });
  const done = await aTask(tx, {
    title: "Call back",
    record: onOpen,
    dueAt: at("2026-10-02T05:00:00Z"),
    doneAt: at("2026-10-02T06:00:00Z"),
  });
  const block = (kind: string, value: string, deletedAt: Date | null = null) =>
    tx.blockedContact.create({ data: { kind, value, deletedAt } });
  await block("phone", contacts.phoneE164);
  await block("email", contacts.email, at("2026-10-05T05:00:00Z")); // unblocked since: the row still holds it
  await block("instagram", contacts.instagramHandle);
  return { person, contacts, destination, open, won, notes, enquiry, followUp, done };
}

describe("a customer's erasure and export", () => {
  let db: Database;
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const erase = (personId: string) => platformDb.transaction((tx) => eraseCustomer(tx, { organizationId, personId }));
  const exported = (personId: string) =>
    platformDb.transaction((tx) => exportCustomer(tx, { organizationId, personId }));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Customer erasure");
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("empties the person's name and contacts and soft-deletes them and their leads", async () => {
    const customer = await inOrg((tx) => aCustomer(tx, "Priya Nair"));

    const erased = await erase(customer.person.id);

    expect(erased.leadIds).toEqual([customer.open.id, customer.won.id].sort());
    const person = await inOrg((tx) =>
      withDeleted(() => tx.person.findUniqueOrThrow({ where: { id: customer.person.id } })),
    );
    expect(person).toMatchObject({ name: "", phoneE164: null, email: null, instagramHandle: null });
    expect(person.erasedAt).not.toBeNull();
    expect(person.deletedAt).not.toBeNull();
    expect(await inOrg((tx) => tx.person.count({ where: { id: customer.person.id } }))).toBe(0);
    expect(await inOrg((tx) => tx.lead.count({ where: { personId: customer.person.id } }))).toBe(0);
    // The trip facts stay for later reports; the source's free-text detail, which may name people, goes.
    const lead = await inOrg((tx) => withDeleted(() => tx.lead.findUniqueOrThrow({ where: { id: customer.open.id } })));
    expect(lead).toMatchObject({
      destinationId: customer.destination.id,
      travelMonth: at("2026-12-01T00:00:00Z"),
      adults: 2,
      budgetPaise: 18_000_000n,
      source: "referral",
      sourceDetail: null,
    });
    expect(lead.deletedAt).not.toBeNull();
  });

  it("deletes their leads' notes and repeat enquiries with those timeline entries", async () => {
    const customer = await inOrg((tx) => aCustomer(tx, "Kabir Rao"));

    expect(await erase(customer.person.id)).toMatchObject({ notes: 2, enquiries: 1, timelineEntries: 3 });

    const leadId = customer.open.id;
    expect(await inOrg((tx) => tx.leadNote.count({ where: { leadId } }))).toBe(0);
    expect(await inOrg((tx) => tx.leadEnquiry.count({ where: { leadId } }))).toBe(0);
    const left = await inOrg((tx) => tx.leadTimelineEntry.findMany({ where: { leadId }, orderBy: { id: "asc" } }));
    expect(left.map((entry) => entry.kind)).toEqual(["created", "stage-changed"]);
  });

  it("removes blocked contacts that held their phone, email or handle", async () => {
    const customer = await inOrg((tx) => aCustomer(tx, "Meera Iyer"));
    const unrelated = await inOrg((tx) => tx.blockedContact.create({ data: { kind: "phone", value: freshPhone() } }));

    expect(await erase(customer.person.id)).toMatchObject({ blockedContacts: 3 });

    const values = Object.values(customer.contacts);
    expect(await inOrg((tx) => withDeleted(() => tx.blockedContact.count({ where: { value: { in: values } } })))).toBe(
      0,
    );
    expect(await inOrg((tx) => tx.blockedContact.count({ where: { id: unrelated.id } }))).toBe(1);
  });

  it("leaves another person's leads, notes and tasks untouched", async () => {
    const [customer, other] = await inOrg(async (tx) => [
      await aCustomer(tx, "Ravi Kumar"),
      await aCustomer(tx, "Asha Mehta"),
    ]);
    const snapshot = () =>
      inOrg(async (tx) => ({
        person: await tx.person.findUniqueOrThrow({ where: { id: other.person.id } }),
        leads: await tx.lead.findMany({ where: { personId: other.person.id }, orderBy: { id: "asc" } }),
        notes: await tx.leadNote.count({ where: { leadId: other.open.id } }),
        enquiries: await tx.leadEnquiry.count({ where: { leadId: other.open.id } }),
        timeline: await tx.leadTimelineEntry.count({ where: { leadId: other.open.id } }),
        tasks: await tx.task.findMany({ where: { recordId: other.open.id }, orderBy: { id: "asc" } }),
        blocked: await withDeleted(() =>
          tx.blockedContact.count({ where: { value: { in: Object.values(other.contacts) } } }),
        ),
      }));
    const before = await snapshot();

    await erase(customer.person.id);

    expect(await snapshot()).toEqual(before);
    expect(before).toMatchObject({ notes: 2, enquiries: 1, timeline: 5, blocked: 3 });
  });

  it("does nothing for a person the organization doesn't have", async () => {
    expect(await erase(randomUUID())).toEqual({
      leadIds: [],
      notes: 0,
      enquiries: 0,
      timelineEntries: 0,
      blockedContacts: 0,
    });
    await expect(exported(randomUUID())).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("exports the person's contacts, leads, notes, enquiries and task titles", async () => {
    const customer = await inOrg((tx) => aCustomer(tx, "Neha Joshi"));

    const result = await exported(customer.person.id);

    expect(result).toMatchObject({
      personId: customer.person.id,
      name: "Neha Joshi",
      phone: customer.contacts.phoneE164,
      email: customer.contacts.email,
      instagramHandle: customer.contacts.instagramHandle,
    });
    expect(result.leads.map((lead) => lead.leadId)).toEqual([customer.open.id, customer.won.id].sort());
    const open = result.leads.find((lead) => lead.leadId === customer.open.id);
    expect(open).toEqual({
      leadId: customer.open.id,
      stage: "contacted",
      source: "referral",
      sourceDetail: "Referred by Neha Joshi's cousin",
      createdAt: "2026-10-01T05:00:00.000Z",
      trip: {
        destination: { id: customer.destination.id, name: customer.destination.name },
        when: { kind: "month", month: "2026-12" },
        adults: 2,
        childrenAges: [6],
        budget: { amount: { amountPaise: 18_000_000, currency: "INR" }, basis: "per_person" },
        departureCity: null,
        tripType: "family",
        hotelCategory: null,
        food: null,
        roomType: null,
      },
      notes: customer.notes.map((note) => ({ body: note.body, createdAt: note.createdAt.toISOString() })),
      enquiries: [
        {
          trip: expect.objectContaining({ when: { kind: "flexible" }, adults: 4, destination: null }) as unknown,
          source: "phone_call",
          sourceDetail: null,
          note: "Neha Joshi asked again",
          createdAt: customer.enquiry.createdAt.toISOString(),
        },
      ],
      tasks: [
        {
          kind: "task",
          title: "Call back",
          dueAt: "2026-10-02T05:00:00.000Z",
          doneAt: "2026-10-02T06:00:00.000Z",
          cancelledAt: null,
        },
        {
          kind: "follow-up",
          title: "Send Neha Joshi the Kashmir quote",
          dueAt: "2026-10-20T05:00:00.000Z",
          doneAt: null,
          cancelledAt: null,
        },
      ],
    });
  });
});
