// Changes from a lead's page (spec 3.4, 4; R29-R32): stages moved by hand forwards or back, the first reply kept, open
// work cancelled on Lost and Not a lead, a closed lead reopened where it was, the lead given to someone who can work
// leads, and its trip and person edited, a contact on another live person refused. A change to what already is
// records nothing.
import { randomUUID } from "node:crypto";
import { editPersonInput, editTripInput, type LeadStage } from "@travel-crm/contracts/crm";
import { createDatabase, softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  editLeadPerson,
  editLeadTrip,
  listLeadTimeline,
  moveLeadStage,
  reassignLead,
  reopenLead,
} from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, aTask, freshPhone, type LeadSeed } from "./support/records.js";

describe("changes from a lead's page", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  let asha: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const leadRow = (id: string) => inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id } }));
  const newLead = (seed: LeadSeed = {}) => inOrg((tx) => aLead(tx, { ownerUserId: salesperson.userId, ...seed }));
  const move = (leadId: string, stage: LeadStage, at = new Date()) =>
    inOrg((tx) => moveLeadStage(tx, salesperson, { leadId, stage }, at));
  const kinds = async (leadId: string) =>
    (await inOrg((tx) => listLeadTimeline(tx, manager, { leadId, limit: 50 }))).entries.map((entry) =>
      entry.kind === "stage-changed" ? `stage-changed:${entry.stage}` : entry.kind,
    );
  const auditOf = (entityId: string) =>
    inOrg((tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));
  const eventsOf = (key: "leadId" | "personId", id: string) =>
    inOrg(async (tx) =>
      (await tx.outboxEvent.findMany({ orderBy: { id: "asc" } }))
        .filter((event) => (event.payload as Record<string, unknown>)[key] === id)
        .map((event) => [event.type, event.payload]),
    );

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Lead changes");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    asha = randomUUID();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("moves a lead to any stage, forwards or back, and writes stage-changed", async () => {
    const lead = await newLead();
    await move(lead.id, "quote_sent");
    await move(lead.id, "contacted");
    expect((await leadRow(lead.id)).stage).toBe("contacted");
    expect(await kinds(lead.id)).toEqual(["stage-changed:contacted", "stage-changed:quote_sent"]);
    expect((await auditOf(lead.id)).map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      ["lead.stage-changed", { stage: "new" }, { stage: "quote_sent" }],
      ["lead.stage-changed", { stage: "quote_sent" }, { stage: "contacted" }],
    ]);
    expect(await eventsOf("leadId", lead.id)).toEqual([
      ["lead.stage-changed", { leadId: lead.id, from: "new", to: "quote_sent" }],
      ["lead.stage-changed", { leadId: lead.id, from: "quote_sent", to: "contacted" }],
    ]);
  });

  it("keeps the first reply when a lead first leaves New, except for Not a lead", async () => {
    const first = new Date("2026-10-17T04:00:00Z");
    const replied = await newLead();
    await move(replied.id, "contacted", first);
    await move(replied.id, "new");
    await move(replied.id, "quote_sent");
    expect((await leadRow(replied.id)).firstReplyAt).toEqual(first);
    const notALead = await newLead();
    await move(notALead.id, "not_a_lead");
    expect((await leadRow(notALead.id)).firstReplyAt).toBeNull();
  });

  it("changes nothing when the lead is already in that stage", async () => {
    const lead = await newLead({ stage: "contacted" });
    await move(lead.id, "contacted");
    expect(await kinds(lead.id)).toEqual([]);
    expect(await auditOf(lead.id)).toEqual([]);
    expect(await eventsOf("leadId", lead.id)).toEqual([]);
  });

  it("cancels every open task on Lost and Not a lead, and keeps them on Won", async () => {
    const tasksOn = (leadId: string) =>
      inOrg(async (tx) => {
        const record = { recordType: "lead", recordId: leadId };
        await aTask(tx, { kind: "follow-up", record, assigneeUserId: salesperson.userId });
        await aTask(tx, { record, assigneeUserId: salesperson.userId });
      });
    const openTasks = (leadId: string) =>
      inOrg((tx) => tx.task.count({ where: { recordId: leadId, doneAt: null, cancelledAt: null } }));
    const [lost, notALead, won] = [await newLead(), await newLead(), await newLead({ stage: "booking_requested" })];
    for (const lead of [lost, notALead, won]) await tasksOn(lead.id);
    await move(lost.id, "lost");
    await move(notALead.id, "not_a_lead");
    await move(won.id, "won");
    expect([await openTasks(lost.id), await openTasks(notALead.id), await openTasks(won.id)]).toEqual([0, 0, 2]);
    expect(await kinds(lost.id)).toEqual(["stage-changed:lost", "follow-up-cancelled", "follow-up-cancelled"]);
  });

  it("reopens a Lost lead to the open stage it had before, or New", async () => {
    const lead = await newLead({ stage: "quote_sent" });
    await move(lead.id, "won");
    await move(lead.id, "lost");
    await inOrg((tx) => reopenLead(tx, salesperson, { leadId: lead.id }, new Date()));
    expect(await leadRow(lead.id)).toMatchObject({ stage: "quote_sent" });
    expect((await auditOf(lead.id)).map((entry) => entry.action)).toEqual([
      "lead.stage-changed",
      "lead.stage-changed",
      "lead.reopened",
    ]);
    await inOrg((tx) => reopenLead(tx, salesperson, { leadId: lead.id }, new Date()));
    expect(await auditOf(lead.id)).toHaveLength(3);

    const neverOpen = await newLead({ stage: "not_a_lead", reopenStage: null });
    await inOrg((tx) => reopenLead(tx, salesperson, { leadId: neverOpen.id }, new Date()));
    expect((await leadRow(neverOpen.id)).stage).toBe("new");
  });

  it("reassigns a lead with its open tasks, tells the new owner, and refuses an owner who can't work leads", async () => {
    const lead = await inOrg(async (tx) => {
      const made = await aLead(tx, { ownerUserId: salesperson.userId });
      await aTask(tx, {
        kind: "follow-up",
        record: { recordType: "lead", recordId: made.id },
        assigneeUserId: salesperson.userId,
      });
      return made;
    });
    const owners = new Set([asha, salesperson.userId]);
    const reassign = (ownerUserId: string, among: ReadonlySet<string>) =>
      inOrg((tx) => reassignLead(tx, manager, { leadId: lead.id, ownerUserId }, { owners: among, now: new Date() }));
    await expect(reassign(randomUUID(), owners)).rejects.toMatchObject({ reason: "NOT_A_LEAD_WORKER" });
    await reassign(asha, owners);
    expect((await leadRow(lead.id)).ownerUserId).toBe(asha);
    expect(await inOrg((tx) => tx.task.findMany({ where: { recordId: lead.id } }))).toMatchObject([
      { assigneeUserId: asha },
    ]);
    expect(await inOrg((tx) => tx.notification.findMany({ where: { link: `/leads/${lead.id}` } }))).toMatchObject([
      { recipientUserId: asha, kind: "lead.assigned" },
    ]);
    await reassign(asha, owners);
    expect(await kinds(lead.id)).toEqual(["reassigned"]);
    await expect(reassign(salesperson.userId, new Set([asha]))).rejects.toMatchObject({ reason: "NOT_A_LEAD_WORKER" });
  });

  it("replaces the trip, writes trip-edited and keeps the audit's before and after", async () => {
    const lead = await inOrg(async (tx) => {
      const goa = await tx.destination.create({ data: { name: "Goa" } });
      return aLead(tx, { ownerUserId: salesperson.userId, destinationId: goa.id, adults: 2, tripType: "friends" });
    });
    const trip = editTripInput.parse({
      leadId: lead.id,
      trip: {
        destination: { kind: "new", name: "Ladakh" },
        when: { kind: "dates", from: "2027-06-10", to: "2027-06-18" },
        adults: 2,
        childrenAges: [],
        budget: { amount: { amountPaise: 15_000_000, currency: "INR" }, basis: "per_person" },
        departureCity: "Delhi",
        tripType: "trek",
        hotelCategory: null,
        food: null,
        roomType: null,
      },
    });
    await inOrg((tx) => editLeadTrip(tx, salesperson, trip));
    expect(await leadRow(lead.id)).toMatchObject({
      travelKind: "dates",
      travelStart: new Date("2027-06-10T00:00:00Z"),
      budgetPaise: 15_000_000n,
      budgetBasis: "per_person",
      departureCity: "Delhi",
      tripType: "trek",
      adults: 2,
    });
    expect(await kinds(lead.id)).toEqual(["trip-edited"]);
    expect((await auditOf(lead.id)).map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      [
        "lead.trip-edited",
        { destination: "Goa", when: { kind: "unknown" }, budget: null, departureCity: null, tripType: "friends" },
        {
          destination: "Ladakh",
          when: { kind: "dates", from: "2027-06-10", to: "2027-06-18" },
          budget: { amountPaise: 15_000_000, basis: "per_person" },
          departureCity: "Delhi",
          tripType: "trek",
        },
      ],
    ]);
    expect(await eventsOf("leadId", lead.id)).toEqual([["lead.trip-edited", { leadId: lead.id }]]);
    await inOrg((tx) => editLeadTrip(tx, salesperson, trip));
    expect(await auditOf(lead.id)).toHaveLength(1);
  });

  it("refuses a contact already on another live person: CONTACT_ON_ANOTHER_PERSON", async () => {
    const [taken, freed, mine] = [freshPhone(), freshPhone(), freshPhone()];
    const lead = await inOrg(async (tx) => {
      await aPerson(tx, { name: "Priya Patel", phoneE164: taken, email: "priya@example.com" });
      const gone = await aPerson(tx, { name: "Old Record", phoneE164: freed });
      await tx.person.update({ where: { id: gone.id }, data: softDeleted(manager.userId) });
      const rahul = await aPerson(tx, { phoneE164: mine });
      return aLead(tx, { personId: rahul.id, ownerUserId: salesperson.userId });
    });
    const edit = (person: Record<string, string>) =>
      inOrg((tx) => editLeadPerson(tx, salesperson, editPersonInput.parse({ leadId: lead.id, person })));
    for (const person of [
      { name: "Rahul Sharma", phone: taken },
      { name: "Rahul", phone: mine, email: "PRIYA@example.com" },
    ]) {
      await expect(edit(person)).rejects.toMatchObject({ code: "CONFLICT", reason: "CONTACT_ON_ANOTHER_PERSON" });
    }
    await edit({ name: "Rahul K. Sharma", phone: freed, instagramHandle: "@rahul.k" });
    expect(await inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: lead.personId } }))).toMatchObject({
      name: "Rahul K. Sharma",
      phoneE164: freed,
      email: null,
      instagramHandle: "rahul.k",
    });
    expect((await auditOf(lead.personId)).map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      [
        "person.edited",
        { name: "Rahul Sharma", phone: mine, instagramHandle: null },
        { name: "Rahul K. Sharma", phone: freed, instagramHandle: "rahul.k" },
      ],
    ]);
    expect(await eventsOf("personId", lead.personId)).toEqual([["person.edited", { personId: lead.personId }]]);
    await edit({ name: "Rahul K. Sharma", phone: freed, instagramHandle: "rahul.k" });
    expect(await auditOf(lead.personId)).toHaveLength(1);
  });
});
