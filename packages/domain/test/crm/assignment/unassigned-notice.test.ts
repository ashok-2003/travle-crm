// A new lead nobody could take tells every holder of leads:assign once (release 4, spec 4.7).
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import {
  checkFirstReply,
  notifyUnassignedLeadListener,
  scheduleFirstReplyCheckListener,
} from "../../../src/crm/index.js";
import type { DomainEvent, ListenerContext } from "../../../src/jobs/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import { aLead } from "../support/records.js";

describe("the Unassigned notice", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  const managerA = randomUUID();
  const managerB = randomUUID();
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const listener = notifyUnassignedLeadListener({ managers: () => Promise.resolve([managerA, managerB]) });

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Unassigned notice");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const created = (lead: { id: string; personId: string }): DomainEvent => ({
    id: randomUUID(),
    organizationId,
    type: "lead.created",
    payload: { leadId: lead.id, personId: lead.personId },
    occurredAt: new Date(),
  });
  const context: () => ListenerContext = () => ({
    actor: systemActor(organizationId),
    forOrg: (work) => db.forOrg(organizationId, work),
  });
  const noticesAbout = (leadId: string) =>
    inOrg((tx) => tx.notification.findMany({ where: { link: `/leads/${leadId}`, kind: "lead.unassigned" } }));

  it("tells each manager once about a lead with no owner, even when the event comes twice", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: null }));
    const event = created(lead);
    await listener.handle(event, context());
    await listener.handle(event, context());
    const notices = await noticesAbout(lead.id);
    expect(notices.map((notice) => notice.recipientUserId).sort()).toEqual([managerA, managerB].sort());
    expect(notices[0]).toMatchObject({ title: "A new lead has no owner", body: "Rahul Sharma" });
  });

  it("says nothing about a lead that has an owner", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: randomUUID() }));
    await listener.handle(created(lead), context());
    expect(await noticesAbout(lead.id)).toEqual([]);
  });

  it("leaves room for the slow-reply alert on the same lead: both notices arrive from one lead.created event", async () => {
    const lead = await inOrg((tx) => aLead(tx, { ownerUserId: null }));
    const event = created(lead);
    await listener.handle(event, context());
    // What the scheduler queues for that event, and what the check then does.
    const queue = createMemoryJobQueue();
    await scheduleFirstReplyCheckListener({
      queue,
      timeZone: () => Promise.resolve("Asia/Kolkata"),
      now: () => new Date(0),
    }).handle(event, context());
    await inOrg((tx) => tx.assignmentSettings.create({ data: { slowReplyMinutes: 15 } }));
    await scheduleFirstReplyCheckListener({
      queue,
      timeZone: () => Promise.resolve("Asia/Kolkata"),
      now: () => new Date(0),
    }).handle(event, context());
    const [job] = queue.sent;
    await checkFirstReply({ db, managers: () => Promise.resolve([managerA, managerB]) }, job?.data);
    const notices = await inOrg((tx) => tx.notification.findMany({ where: { link: `/leads/${lead.id}` } }));
    expect(notices.map((notice) => `${notice.kind}:${notice.recipientUserId}`).sort()).toEqual(
      [
        `lead.unassigned:${managerA}`,
        `lead.unassigned:${managerB}`,
        `lead.slow-reply:${managerA}`,
        `lead.slow-reply:${managerB}`,
      ].sort(),
    );
  });
});
