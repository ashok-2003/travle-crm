// Adding a lead by hand (spec 3.2, 4; R14, R23, R24, R32, R36): the owner the form names, a known person found again,
// a repeat enquiry on their open lead or a new trip marked returning, and one person when two saves of a new number
// race. Each change is audited and published; the owner of a lead made or added to by someone else is told.
import { randomUUID } from "node:crypto";
import { createLeadInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type ForOrgOptions, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createLead } from "../../src/crm/index.js";
import type { MemberAccess } from "../../src/identity/index.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";
import { backendPid, waitUntilBlockedBy } from "../lock-waits.js";
import { aLead, aPerson, freshPhone } from "./support/records.js";

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

/** The form's input as the api parses it: Rahul Sharma with a phone, no trip, from a phone call. */
function leadInput(person: Record<string, string>, rest: Record<string, unknown> = {}) {
  return createLeadInput.parse({
    person: { name: "Rahul Sharma", ...person },
    trip: noTrip,
    note: null,
    source: "phone_call",
    sourceDetail: null,
    ownerUserId: null,
    whenOpenLead: null,
    ...rest,
  });
}

describe("adding a lead by hand", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let manager: MemberAccess;
  let salesperson: MemberAccess;
  let asha: string;
  const now = new Date();

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const noOwners = { owners: new Set<string>(), now };
  const leadRow = (id: string) =>
    inOrg((tx) => tx.lead.findUniqueOrThrow({ where: { id }, include: { person: true } }));
  const auditOf = (entityId: string) =>
    inOrg((tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));
  const eventsOf = (key: "leadId" | "personId", id: string) =>
    inOrg(async (tx) =>
      (await tx.outboxEvent.findMany({ orderBy: { id: "asc" } }))
        .filter((event) => (event.payload as Record<string, unknown>)[key] === id)
        .map((event) => [event.type, event.payload]),
    );
  const timelineOf = (leadId: string) =>
    inOrg((tx) => tx.leadTimelineEntry.findMany({ where: { leadId }, orderBy: { id: "asc" } }));
  const toldAbout = (leadId: string) =>
    inOrg((tx) => tx.notification.findMany({ where: { link: `/leads/${leadId}` }, orderBy: { id: "asc" } }));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Adding leads");
    manager = memberWithStarterRole("org-admin", { organizationId, userId: randomUUID() });
    salesperson = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    asha = randomUUID();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("adds a lead with only a name and a phone, owned by whoever adds it, in stage New", async () => {
    const phone = freshPhone();
    const created = await createLead(db, salesperson, leadInput({ phone }), noOwners);
    expect(created).toMatchObject({ outcome: "created", returning: false });
    expect(await leadRow(created.leadId ?? "")).toMatchObject({
      stage: "new",
      ownerUserId: salesperson.userId,
      createdBy: salesperson.userId,
      returning: false,
      firstReplyAt: null,
      travelKind: "unknown",
      source: "phone_call",
      person: { name: "Rahul Sharma", phoneE164: phone, email: null, createdBy: salesperson.userId },
    });
  });

  it("refuses another owner without leads:assign, and one who can't work leads", async () => {
    const phone = freshPhone();
    await expect(
      createLead(db, salesperson, leadInput({ phone }, { ownerUserId: asha }), { owners: new Set([asha]), now }),
    ).rejects.toMatchObject({ reason: "MISSING_PERMISSION" });
    await expect(
      createLead(db, manager, leadInput({ phone }, { ownerUserId: asha }), { owners: new Set(), now }),
    ).rejects.toMatchObject({ reason: "NOT_A_LEAD_WORKER" });
    expect(await inOrg((tx) => tx.person.count({ where: { phoneE164: phone } }))).toBe(0);
  });

  it("asks with OPEN_LEAD_EXISTS when the person has an open lead and no choice was made", async () => {
    const phone = freshPhone();
    const open = await inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id }));
    await expect(createLead(db, manager, leadInput({ phone }), noOwners)).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "OPEN_LEAD_EXISTS",
    });
    expect(await inOrg((tx) => tx.lead.count({ where: { personId: open.personId } }))).toBe(1);
  });

  it("adds a repeat enquiry to the open lead, tells its owner, and fills a missing email, never overwriting", async () => {
    const phone = freshPhone();
    const { person, open } = await inOrg(async (tx) => {
      await aPerson(tx, { name: "Someone Else", instagramHandle: "rahul.travels" });
      const rahul = await aPerson(tx, { phoneE164: phone });
      return { person: rahul, open: await aLead(tx, { personId: rahul.id, ownerUserId: asha, stage: "contacted" }) };
    });
    // The email fills a gap; the handle is another live person's, so it is dropped (R32).
    const enquiry = leadInput(
      { name: "R. Sharma", phone, email: "Rahul@Example.com", instagramHandle: "@rahul.travels" },
      {
        trip: { ...noTrip, destination: { kind: "new", name: "Kerala" }, when: { kind: "month", month: "2026-12" } },
        note: "Now wants Kerala in December",
        source: "walk_in",
        whenOpenLead: "add-to-it",
      },
    );
    expect(await createLead(db, manager, enquiry, noOwners)).toEqual({
      outcome: "added-to-open-lead",
      leadId: open.id,
      returning: false,
    });
    expect(await inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: person.id } }))).toMatchObject({
      name: "Rahul Sharma",
      email: "rahul@example.com",
      instagramHandle: null,
    });
    const [saved] = await inOrg((tx) =>
      tx.leadEnquiry.findMany({ where: { leadId: open.id }, include: { destination: true } }),
    );
    expect(saved).toMatchObject({
      note: "Now wants Kerala in December",
      source: "walk_in",
      travelKind: "month",
      travelMonth: new Date("2026-12-01T00:00:00Z"),
      destination: { name: "Kerala" },
      createdBy: manager.userId,
    });
    expect((await timelineOf(open.id)).map((entry) => [entry.kind, entry.recordType, entry.recordId])).toEqual([
      ["repeat-enquiry", "lead_enquiry", saved?.id],
    ]);
    expect((await auditOf(open.id)).map((entry) => [entry.action, entry.after])).toEqual([
      ["lead.repeat-enquiry", { recordId: saved?.id }],
    ]);
    expect(await eventsOf("leadId", open.id)).toEqual([
      ["lead.repeat-enquiry", { leadId: open.id, enquiryId: saved?.id }],
    ]);
    expect((await auditOf(person.id)).map((entry) => [entry.action, entry.before, entry.after])).toEqual([
      ["person.edited", { email: null }, { email: "rahul@example.com" }],
    ]);
    expect(await eventsOf("personId", person.id)).toEqual([["person.edited", { personId: person.id }]]);
    expect(await toldAbout(open.id)).toMatchObject([
      {
        recipientUserId: asha,
        kind: "lead.repeat-enquiry",
        title: "Repeat enquiry on your lead",
        body: "Rahul Sharma asked again",
      },
    ]);
    expect(await inOrg((tx) => tx.lead.count({ where: { personId: person.id } }))).toBe(1);

    // A salesperson adding to Asha's lead isn't told its id (R24), and a different email never replaces the stored one.
    const again = leadInput({ phone, email: "other@example.com" }, { whenOpenLead: "add-to-it" });
    expect(await createLead(db, salesperson, again, noOwners)).toMatchObject({ leadId: null });
    expect((await inOrg((tx) => tx.person.findUniqueOrThrow({ where: { id: person.id } }))).email).toBe(
      "rahul@example.com",
    );
    expect((await auditOf(person.id)).map((entry) => entry.action)).toEqual(["person.edited"]);
  });

  it("makes a new trip enquiry for the same person, marked returning", async () => {
    const phone = freshPhone();
    const open = await inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id }));
    const created = await createLead(db, manager, leadInput({ phone }, { whenOpenLead: "new-lead" }), noOwners);
    expect(created).toMatchObject({ outcome: "created", returning: true });
    expect(await leadRow(created.leadId ?? "")).toMatchObject({ personId: open.personId, returning: true });
    expect(await inOrg((tx) => tx.person.count({ where: { phoneE164: phone } }))).toBe(1);
  });

  it("marks a lead returning when the person had only a closed lead", async () => {
    const phone = freshPhone();
    await inOrg(async (tx) => aLead(tx, { personId: (await aPerson(tx, { phoneE164: phone })).id, stage: "lost" }));
    const created = await createLead(db, manager, leadInput({ phone }), noOwners);
    expect(created).toMatchObject({ outcome: "created", returning: true });
  });

  it("makes one person when two saves of a new number race; the second is asked about the open lead", async () => {
    const phone = freshPhone();
    let release: () => void = () => undefined;
    const mayCommit = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstSaved: (holder: number) => void = () => undefined;
    const saved = new Promise<number>((resolve) => {
      firstSaved = resolve;
    });
    // The first save holds its transaction open once its rows are written, so the second can't see them yet.
    const holding: Database = {
      ...db,
      forOrg: <T>(orgId: string, work: (tx: OrgTx) => Promise<T>, options?: ForOrgOptions) =>
        db.forOrg(
          orgId,
          async (tx) => {
            const result = await work(tx);
            firstSaved(await backendPid(tx));
            await mayCommit;
            return result;
          },
          options,
        ),
    };
    const first = createLead(holding, salesperson, leadInput({ phone }), noOwners);
    const holder = await saved;
    const second = createLead(db, manager, leadInput({ phone }), noOwners);
    await waitUntilBlockedBy(platform, holder);
    release();
    await expect(first).resolves.toMatchObject({ outcome: "created" });
    await expect(second).rejects.toMatchObject({ reason: "OPEN_LEAD_EXISTS" });
    expect(await inOrg((tx) => tx.person.count({ where: { phoneE164: phone } }))).toBe(1);
  });

  it("writes created, note and reassigned on the timeline, one lead.added audit entry and lead.created", async () => {
    const phone = freshPhone();
    const input = leadInput(
      { phone },
      {
        trip: {
          destination: { kind: "new", name: "Andaman" },
          when: { kind: "dates", from: "2026-11-14", to: "2026-11-20" },
          adults: 2,
          childrenAges: [7, 4],
          budget: { amount: { amountPaise: 9_000_000, currency: "INR" }, basis: "per_person" },
          departureCity: "Pune",
          tripType: "family",
          hotelCategory: "4_star",
          food: "veg",
          roomType: "Family room",
        },
        note: "Wants a sea view",
        source: "referral",
        sourceDetail: "Mehta family",
        ownerUserId: asha,
      },
    );
    const created = await createLead(db, manager, input, { owners: new Set([asha]), now });
    const leadId = created.leadId ?? "";
    const lead = await leadRow(leadId);
    expect(lead).toMatchObject({
      ownerUserId: asha,
      createdBy: manager.userId,
      travelKind: "dates",
      travelStart: new Date("2026-11-14T00:00:00Z"),
      travelEnd: new Date("2026-11-20T00:00:00Z"),
      travelMonth: null,
      adults: 2,
      childrenAges: [7, 4],
      budgetPaise: 9_000_000n,
      budgetBasis: "per_person",
      departureCity: "Pune",
      tripType: "family",
      hotelCategory: "4_star",
      food: "veg",
      roomType: "Family room",
      source: "referral",
      sourceDetail: "Mehta family",
    });
    const entries = await timelineOf(leadId);
    expect(entries.map((entry) => [entry.kind, entry.recordType, entry.ownerUserId, entry.actorUserId])).toEqual([
      ["created", null, null, manager.userId],
      ["note", "lead_note", null, manager.userId],
      ["reassigned", null, asha, manager.userId],
    ]);
    const notes = await inOrg((tx) => tx.leadNote.findMany({ where: { leadId } }));
    expect(notes).toMatchObject([{ id: entries[1]?.recordId, body: "Wants a sea view", createdBy: manager.userId }]);
    const audit = await auditOf(leadId);
    expect(audit.map((entry) => [entry.action, entry.after])).toEqual([
      ["lead.added", { stage: "new", ownerUserId: asha, source: "referral" }],
    ]);
    expect(JSON.stringify(audit)).not.toContain("sea view");
    expect((await auditOf(lead.personId)).map((entry) => [entry.action, entry.after])).toEqual([
      ["person.added", { name: "Rahul Sharma", phone, email: null, instagramHandle: null }],
    ]);
    expect(await eventsOf("leadId", leadId)).toEqual([["lead.created", { leadId, personId: lead.personId }]]);
    expect(await toldAbout(leadId)).toMatchObject([
      {
        recipientUserId: asha,
        kind: "lead.assigned",
        title: "New lead assigned to you",
        body: "Rahul Sharma · Andaman",
      },
    ]);
  });

  it("adds a new destination by name, and uses Goa for 'goa'", async () => {
    const trip = (name: string) => ({ trip: { ...noTrip, destination: { kind: "new", name } } });
    const first = await createLead(db, manager, leadInput({ phone: freshPhone() }, trip("Goa")), noOwners);
    const second = await createLead(db, manager, leadInput({ phone: freshPhone() }, trip("goa")), noOwners);
    const [goa, again] = [await leadRow(first.leadId ?? ""), await leadRow(second.leadId ?? "")];
    expect(goa.destinationId).not.toBeNull();
    expect(again.destinationId).toBe(goa.destinationId);
    expect(
      await inOrg((tx) => tx.destination.findMany({ where: { name: { equals: "goa", mode: "insensitive" } } })),
    ).toMatchObject([{ name: "Goa" }]);
    const chosen = { trip: { ...noTrip, destination: { kind: "existing", destinationId: goa.destinationId } } };
    const third = await createLead(db, manager, leadInput({ phone: freshPhone() }, chosen), noOwners);
    expect((await leadRow(third.leadId ?? "")).destinationId).toBe(goa.destinationId);
  });
});
