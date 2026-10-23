// The slow-reply alert (release 4, spec 4.5, 4.6): the check is queued for the end of the wait counted in working
// minutes in the agency's zone, across a night and a weekend; a lead that was answered is left alone, a lead still New
// tells every holder of leads:assign once, and a repeat adds nothing.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { checkFirstReply, FIRST_REPLY_CHECK_QUEUE, scheduleFirstReplyCheckListener } from "../../../src/crm/index.js";
import type { DomainEvent, ListenerContext } from "../../../src/jobs/index.js";
import { systemActor } from "../../../src/kernel/index.js";
import { aLead } from "../support/records.js";

const india = (local: string) => new Date(`${local}+05:30`);
// 2026-10-19 is a Monday. The agency answers Monday to Saturday, 10:00 to 19:00, in India.
const WORKING_WEEK = { workdays: 63, dayOpensMinute: 600, dayClosesMinute: 1140 };

describe("the slow-reply alert", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Slow reply");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  async function settings(data: { slowReplyMinutes: number | null } & Partial<typeof WORKING_WEEK>) {
    await inOrg(async (tx) => {
      await tx.assignmentSettings.deleteMany({});
      await tx.assignmentSettings.create({ data: { ...WORKING_WEEK, ...data } });
    });
  }

  /** Runs the scheduler for a lead created at a time, with the clock at `clock`; returns the jobs it queued. */
  async function scheduled(createdAt: Date, options: { clock?: Date; stage?: "new" | "contacted" } = {}) {
    const lead = await inOrg((tx) => aLead(tx, { createdAt, ...(options.stage ? { stage: options.stage } : {}) }));
    const queue = createMemoryJobQueue();
    const listener = scheduleFirstReplyCheckListener({
      queue,
      timeZone: () => Promise.resolve("Asia/Kolkata"),
      now: () => options.clock ?? createdAt,
    });
    const event: DomainEvent = {
      id: randomUUID(),
      organizationId,
      type: "lead.created",
      payload: { leadId: lead.id, personId: lead.personId },
      occurredAt: createdAt,
    };
    const context: ListenerContext = {
      actor: systemActor(organizationId),
      forOrg: (work) => db.forOrg(organizationId, work),
    };
    await listener.handle(event, context);
    return { jobs: queue.sent, event, lead };
  }

  describe("queuing the check", () => {
    it("queues nothing when the agency set no limit", async () => {
      await settings({ slowReplyMinutes: null });
      expect((await scheduled(india("2026-10-19T11:00:00"))).jobs).toEqual([]);
    });

    it("queues it for the end of the wait, with ids only, inside working hours", async () => {
      await settings({ slowReplyMinutes: 15 });
      const { jobs, event, lead } = await scheduled(india("2026-10-19T11:00:00"));
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        queue: FIRST_REPLY_CHECK_QUEUE,
        data: { organizationId, leadId: lead.id, sourceEventId: event.id },
        options: { startAfter: india("2026-10-19T11:15:00") },
      });
    });

    it("carries a wait over the close of the day, a night and a weekend", async () => {
      await settings({ slowReplyMinutes: 15 });
      const dueFor = async (local: string) => (await scheduled(india(local))).jobs[0]?.options.startAfter;
      expect(await dueFor("2026-10-19T18:50:00")).toEqual(india("2026-10-20T10:05:00"));
      expect(await dueFor("2026-10-20T02:00:00")).toEqual(india("2026-10-20T10:15:00"));
      expect(await dueFor("2026-10-24T18:55:00")).toEqual(india("2026-10-26T10:10:00"));
      expect(await dueFor("2026-10-25T12:00:00")).toEqual(india("2026-10-26T10:15:00"));
    });

    it("counts the agency's own days and hours", async () => {
      await settings({ slowReplyMinutes: 30, workdays: 0b0000011, dayOpensMinute: 9 * 60, dayClosesMinute: 17 * 60 });
      // Wednesday 2026-10-21: only Monday and Tuesday work, so the wait runs from Monday 09:00.
      expect((await scheduled(india("2026-10-21T12:00:00"))).jobs[0]?.options.startAfter).toEqual(
        india("2026-10-26T09:30:00"),
      );
    });

    it("ignores a lead that is not New, and an imported lead whose wait ended long ago", async () => {
      await settings({ slowReplyMinutes: 15 });
      expect((await scheduled(india("2026-10-19T11:00:00"), { stage: "contacted" })).jobs).toEqual([]);
      const old = await scheduled(india("2026-01-05T11:00:00"), { clock: india("2026-10-19T11:00:00") });
      expect(old.jobs).toEqual([]);
    });
  });

  describe("the check", () => {
    const managerA = randomUUID();
    const managerB = randomUUID();
    const dependencies = () => ({ db, managers: () => Promise.resolve([managerA, managerB]) });
    const jobFor = (leadId: string, sourceEventId = randomUUID()) => ({ organizationId, leadId, sourceEventId });
    const slowReplyNotices = (userId: string) =>
      inOrg((tx) => tx.notification.findMany({ where: { recipientUserId: userId, kind: "lead.slow-reply" } }));

    it("tells every manager once about a lead still New with no reply, and a repeat adds nothing", async () => {
      const lead = await inOrg((tx) => aLead(tx));
      const job = jobFor(lead.id);
      await checkFirstReply(dependencies(), job);
      await checkFirstReply(dependencies(), job);
      for (const manager of [managerA, managerB]) {
        const notices = (await slowReplyNotices(manager)).filter((notice) => notice.link === `/leads/${lead.id}`);
        expect(notices).toHaveLength(1);
        expect(notices[0]).toMatchObject({ title: "A new lead is waiting for a reply", body: "Rahul Sharma" });
      }
    });

    it("leaves a lead that was answered, moved on, or deleted alone", async () => {
      const left = await inOrg(async (tx) => ({
        replied: await aLead(tx, { firstReplyAt: new Date() }),
        moved: await aLead(tx, { stage: "contacted" }),
        deleted: await aLead(tx),
      }));
      await inOrg((tx) => tx.lead.update({ where: { id: left.deleted.id }, data: { deletedAt: new Date() } }));
      const leads = Object.values(left);
      for (const lead of leads) await checkFirstReply(dependencies(), jobFor(lead.id));
      const notices = await slowReplyNotices(managerA);
      for (const lead of leads) expect(notices.some((notice) => notice.link === `/leads/${lead.id}`)).toBe(false);
    });

    it("ends silently when nobody holds leads:assign", async () => {
      const lead = await inOrg((tx) => aLead(tx));
      await checkFirstReply({ db, managers: () => Promise.resolve([]) }, jobFor(lead.id));
      const notices = await inOrg((tx) => tx.notification.findMany({ where: { link: `/leads/${lead.id}` } }));
      expect(notices).toEqual([]);
    });
  });
});
