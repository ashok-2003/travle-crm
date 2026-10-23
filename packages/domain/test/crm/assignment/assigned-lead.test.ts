// A lead that arrives by itself and is assigned (release 4, spec 4.7): the choice's reason goes in its creation audit
// entry and on its "created" timeline entry, a lead nobody could take is left Unassigned with that said, and a repeat
// enquiry on an open lead is never reassigned.
import { randomUUID } from "node:crypto";
import type { TripInput } from "@travel-crm/contracts/crm";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { saveEnquiry, type Enquiry } from "../../../src/crm/save-enquiry.js";
import { systemActor } from "../../../src/kernel/index.js";
import { freshPhone } from "../support/records.js";

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
const now = new Date("2026-10-23T05:00:00.000Z");

describe("an assigned lead", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  const [owner, priya, ravi] = [randomUUID(), randomUUID(), randomUUID()];
  const workers = new Set([owner, priya, ravi]);
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const enquiry = (phone: string): Enquiry => ({
    person: { name: "Rahul Sharma", phone },
    trip: noTrip,
    note: null,
    source: "web_form",
    sourceDetail: null,
  });
  const arrive = (phone = freshPhone()) =>
    inOrg((tx) =>
      saveEnquiry(tx, systemActor(organizationId), enquiry(phone), now, {
        from: "import",
        ownerUserId: owner,
        stage: "new",
        createdAt: null,
        assign: { workers },
      }),
    );

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Assigned lead");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("records why on the creation audit entry and the created timeline entry", async () => {
    await inOrg(async (tx) => {
      await tx.assignmentSettings.create({ data: { mode: "turns" } });
      await tx.assignmentPoolMember.createMany({ data: [{ userId: priya }, { userId: ravi }] });
    });
    const first = await arrive();
    const second = await arrive();
    expect(first.leadOwnerUserId).toBe(priya);
    expect(second.leadOwnerUserId).toBe(ravi);

    const audit = await inOrg((tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "lead.added", entityId: first.leadId } }),
    );
    expect(audit.after).toMatchObject({
      ownerUserId: priya,
      assignedBy: { reason: "turns", rulePosition: null, away: false },
    });
    const created = await inOrg((tx) =>
      tx.leadTimelineEntry.findFirstOrThrow({ where: { leadId: first.leadId, kind: "created" } }),
    );
    expect(created).toMatchObject({ ownerUserId: priya, assignmentReason: "turns", assignmentAway: false });
  });

  it("leaves a lead nobody could take Unassigned, and says so", async () => {
    await inOrg(async (tx) => {
      await tx.assignmentPoolMember.updateMany({ data: { awayUntil: new Date("2026-10-30T00:00:00Z") } });
    });
    const saved = await arrive();
    expect(saved.leadOwnerUserId).toBeNull();
    const created = await inOrg((tx) =>
      tx.leadTimelineEntry.findFirstOrThrow({ where: { leadId: saved.leadId, kind: "created" } }),
    );
    expect(created).toMatchObject({ ownerUserId: null, assignmentReason: "none" });
  });

  it("sends a returning customer back to their earlier owner even while away, and says they are away", async () => {
    const phone = freshPhone();
    const earlier = await inOrg(async (tx) => {
      await tx.assignmentPoolMember.updateMany({ data: { awayUntil: null } });
      return saveEnquiry(tx, systemActor(organizationId), enquiry(phone), now, {
        from: "import",
        ownerUserId: ravi,
        stage: "won",
        createdAt: null,
      });
    });
    await inOrg((tx) =>
      tx.assignmentPoolMember.updateMany({
        where: { userId: ravi },
        data: { awayUntil: new Date("2026-10-30T00:00:00Z") },
      }),
    );
    const again = await arrive(phone);
    expect(earlier.leadOwnerUserId).toBe(ravi);
    expect(again.leadOwnerUserId).toBe(ravi);
    const created = await inOrg((tx) =>
      tx.leadTimelineEntry.findFirstOrThrow({ where: { leadId: again.leadId, kind: "created" } }),
    );
    expect(created).toMatchObject({ assignmentReason: "returning", assignmentAway: true });
  });

  it("never reassigns a repeat enquiry on an open lead", async () => {
    await inOrg((tx) => tx.assignmentPoolMember.updateMany({ data: { awayUntil: null } }));
    const phone = freshPhone();
    const first = await arrive(phone);
    const repeat = await arrive(phone);
    expect(repeat.outcome).toBe("added-to-open-lead");
    expect(repeat.leadId).toBe(first.leadId);
    expect(repeat.leadOwnerUserId).toBe(first.leadOwnerUserId);
  });
});
