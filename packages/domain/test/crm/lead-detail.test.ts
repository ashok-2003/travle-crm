// A lead's page (spec 3.4; R26, R28): the lead with its person, trip, owner, source and open work; its timeline newest
// first, each entry with what it points to; notes added to it; and a lead out of the member's scope is "not found" from
// every door into it.
import { randomUUID } from "node:crypto";
import { editPersonInput, editTripInput, timelineInput } from "@travel-crm/contracts/crm";
import { createDatabase, softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  addLeadNote,
  addLeadWork,
  blockLeadContact,
  editLeadPerson,
  editLeadTrip,
  getLead,
  listLeadTimeline,
  moveLeadStage,
  reassignLead,
  reopenLead,
  recordLeadEvent,
} from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { aLead, aPerson, aTask } from "./support/records.js";

const noTrip = {
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
const rahul = { name: "Rahul Sharma", phone: "+919876543210" };

describe("a lead's page", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  let asha: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const timeline = (access: MemberAccess, input: Record<string, unknown>) =>
    inOrg((tx) => listLeadTimeline(tx, access, timelineInput.parse(input)));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Lead page");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    asha = randomUUID();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("reads a lead with its person, trip, budget as Money, owner, source and open work earliest first", async () => {
    const later = new Date(Date.now() + 5 * 60 * 60 * 1000);
    const sooner = new Date(Date.now() + 60 * 60 * 1000);
    const { lead, person, kashmir, first, second } = await inOrg(async (tx) => {
      const destination = await tx.destination.create({ data: { name: "Kashmir" } });
      const someone = await aPerson(tx, { email: "rahul@example.com", instagramHandle: "rahul.travels" });
      const made = await aLead(tx, {
        personId: someone.id,
        ownerUserId: asha,
        stage: "contacted",
        reopenStage: "new",
        destinationId: destination.id,
        travelKind: "month",
        travelMonth: new Date("2026-12-01T00:00:00Z"),
        adults: 2,
        childrenAges: [9],
        budgetPaise: 12_500_000n,
        budgetBasis: "per_person",
        tripType: "family",
        source: "referral",
        createdBy: manager.userId,
      });
      const on = { recordType: "lead", recordId: made.id };
      const afterIt = await aTask(tx, { kind: "follow-up", record: on, dueAt: later, assigneeUserId: asha });
      const beforeIt = await aTask(tx, {
        kind: "task",
        title: "Ask about visas",
        record: on,
        dueAt: sooner,
        assigneeUserId: asha,
      });
      await aTask(tx, { kind: "follow-up", record: on, dueAt: sooner, doneAt: new Date(), assigneeUserId: asha });
      return { lead: made, person: someone, kashmir: destination, first: beforeIt, second: afterIt };
    });
    const detail = await inOrg((tx) => getLead(tx, manager, lead.id));
    expect(detail).toMatchObject({
      id: lead.id,
      stage: "contacted",
      reopenStage: "new",
      firstReplyAt: null,
      returning: false,
      person: {
        id: person.id,
        name: "Rahul Sharma",
        phone: expect.stringMatching(/^\+9198/) as string,
        email: "rahul@example.com",
        instagramHandle: "rahul.travels",
      },
      trip: {
        destination: { id: kashmir.id, name: "Kashmir" },
        when: { kind: "month", month: "2026-12" },
        adults: 2,
        childrenAges: [9],
        budget: { amount: { amountPaise: 12_500_000, currency: "INR" }, basis: "per_person" },
        departureCity: null,
        tripType: "family",
        hotelCategory: null,
        food: null,
        roomType: null,
      },
      source: "referral",
      sourceDetail: null,
      ownerUserId: asha,
      createdBy: manager.userId,
    });
    expect(detail.work).toEqual([
      { id: first.id, kind: "task", title: "Ask about visas", dueAt: sooner.toISOString(), assigneeUserId: asha },
      { id: second.id, kind: "follow-up", title: "Call back", dueAt: later.toISOString(), assigneeUserId: asha },
    ]);
  });

  it("answers NOT_FOUND for another salesperson's lead, from every procedure", async () => {
    const { theirs, gone } = await inOrg(async (tx) => {
      const other = await aLead(tx, { ownerUserId: asha });
      const removed = await aLead(tx, { ownerUserId: salesperson.userId });
      await tx.lead.update({ where: { id: removed.id }, data: softDeleted(manager.userId) });
      return { theirs: other.id, gone: removed.id };
    });
    const now = new Date("2026-10-17T05:00:00Z");
    const everyone = { owners: new Set([salesperson.userId, asha]), now };
    const due = { on: "2026-10-18", at: "10:00" };
    for (const leadId of [theirs, gone, randomUUID()]) {
      const doors = [
        () => inOrg((tx) => getLead(tx, salesperson, leadId)),
        () => timeline(salesperson, { leadId }),
        () => inOrg((tx) => addLeadNote(tx, salesperson, { leadId, body: "Called" })),
        () => inOrg((tx) => moveLeadStage(tx, salesperson, { leadId, stage: "lost" }, new Date())),
        () => inOrg((tx) => reopenLead(tx, salesperson, { leadId }, new Date())),
        () => inOrg((tx) => editLeadTrip(tx, salesperson, editTripInput.parse({ leadId, trip: noTrip }))),
        () => inOrg((tx) => editLeadPerson(tx, salesperson, editPersonInput.parse({ leadId, person: rahul }))),
        () => inOrg((tx) => reassignLead(tx, salesperson, { leadId, ownerUserId: salesperson.userId }, everyone)),
        () => inOrg((tx) => addLeadWork(tx, salesperson, { leadId, kind: "follow-up", title: "Call", due }, now)),
        () => inOrg((tx) => blockLeadContact(tx, salesperson, { leadId }, new Date())),
      ];
      for (const door of doors) await expect(door()).rejects.toMatchObject({ code: "NOT_FOUND", reason: "NOT_FOUND" });
    }
    expect(await inOrg((tx) => tx.leadNote.count({ where: { leadId: theirs } }))).toBe(0);
    expect(await inOrg((tx) => tx.task.count({ where: { recordId: theirs } }))).toBe(0);
    expect(await inOrg((tx) => tx.blockedContact.count())).toBe(0);
    expect(await inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id: theirs } }))).toMatchObject({
      stage: "new",
      ownerUserId: asha,
      travelKind: "unknown",
    });
    await expect(inOrg((tx) => getLead(tx, manager, gone))).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });

  it("pages the timeline newest first, each kind with what it points to", async () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 4, minute));
    const lead = await inOrg(async (tx) => {
      const goa = await tx.destination.create({ data: { name: "Goa" } });
      const made = await aLead(tx, { ownerUserId: asha, source: "walk_in" });
      const leadId = made.id;
      const entry = (kind: Parameters<typeof recordLeadEvent>[2]["kind"], extra: object = {}) =>
        recordLeadEvent(tx, manager, { leadId, kind, ...extra });
      const note = await tx.leadNote.create({ data: { leadId, body: "Prefers trains" } });
      const enquiry = await tx.leadEnquiry.create({
        data: { leadId, destinationId: goa.id, travelKind: "flexible", source: "instagram", note: "Goa instead?" },
      });
      const task = await aTask(tx, {
        kind: "follow-up",
        title: "Send the quote",
        dueAt: at(30),
        record: { recordType: "lead", recordId: leadId },
      });
      const taskRecord = { recordType: "task", recordId: task.id };
      await entry("created", { occurredAt: at(0) });
      await entry("note", { record: { recordType: "lead_note", recordId: note.id }, occurredAt: at(1) });
      await entry("reassigned", { ownerUserId: asha, occurredAt: at(2) });
      await entry("follow-up-added", { record: taskRecord, occurredAt: at(3) });
      await entry("stage-changed", { stage: "contacted", occurredAt: at(4) });
      await entry("repeat-enquiry", {
        record: { recordType: "lead_enquiry", recordId: enquiry.id },
        occurredAt: at(5),
      });
      await entry("trip-edited", { occurredAt: at(6) });
      await entry("follow-up-done", { record: taskRecord, occurredAt: at(7) });
      await entry("follow-up-cancelled", { record: taskRecord, occurredAt: at(8) });
      return { id: leadId, goa };
    });
    const first = await timeline(manager, { leadId: lead.id, limit: 4 });
    expect(first.entries.map((entry) => entry.kind)).toEqual([
      "follow-up-cancelled",
      "follow-up-done",
      "trip-edited",
      "repeat-enquiry",
    ]);
    expect(first.entries[0]).toEqual({
      id: expect.any(String) as string,
      kind: "follow-up-cancelled",
      occurredAt: at(8).toISOString(),
      actorUserId: manager.userId,
      task: { kind: "follow-up", title: "Send the quote", dueAt: at(30).toISOString() },
    });
    expect(first.entries[3]).toMatchObject({
      kind: "repeat-enquiry",
      enquiry: {
        source: "instagram",
        sourceDetail: null,
        note: "Goa instead?",
        trip: { destination: { id: lead.goa.id, name: "Goa" }, when: { kind: "flexible" }, childrenAges: [] },
      },
    });
    const second = await timeline(manager, { leadId: lead.id, limit: 4, before: first.nextCursor });
    expect(second.entries).toMatchObject([
      { kind: "stage-changed", stage: "contacted" },
      { kind: "follow-up-added", task: { title: "Send the quote" } },
      { kind: "reassigned", ownerUserId: asha },
      { kind: "note", body: "Prefers trains" },
    ]);
    const third = await timeline(manager, { leadId: lead.id, limit: 4, before: second.nextCursor });
    expect(third).toEqual({
      entries: [
        {
          id: expect.any(String) as string,
          kind: "created",
          source: "walk_in",
          occurredAt: at(0).toISOString(),
          actorUserId: manager.userId,
        },
      ],
      nextCursor: null,
    });
  });

  it("adds a note to the timeline, and records lead.note-added without its text", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: salesperson.userId }));
    await inOrg((tx) => addLeadNote(tx, salesperson, { leadId: lead.id, body: "Wants a houseboat night" }));
    const { entries } = await timeline(salesperson, { leadId: lead.id });
    expect(entries).toMatchObject([{ kind: "note", body: "Wants a houseboat night", actorUserId: salesperson.userId }]);
    const audit = await inOrg((tx) => tx.auditEntry.findMany({ where: { entityId: lead.id } }));
    expect(audit).toMatchObject([{ action: "lead.note-added", entityType: "lead", actorUserId: salesperson.userId }]);
    expect(JSON.stringify(audit)).not.toContain("houseboat");
    const events = await inOrg((tx) => tx.outboxEvent.findMany());
    expect(events.filter((event) => JSON.stringify(event.payload).includes(lead.id))).toEqual([]);
  });
});
