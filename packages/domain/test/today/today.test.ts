// Today (spec 3.5, R35): the signed-in person's own overdue and due-today follow-ups and tasks and their new leads
// waiting for a reply, split at the agency's midnight, with the top three for Home, each section 20 a page, and each
// lead's name, phone and trip line beside its task.
import { randomUUID } from "node:crypto";
import type { TodayItem, TodaySectionName } from "@travel-crm/contracts/today";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { todaySection, todaySummary } from "../../src/today/index.js";
import { aLead, aPerson, aTask, freshPhone } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const at = (iso: string) => new Date(iso);
const HOUR_MS = 60 * 60 * 1000;

/** What each item is about: the task's id, or the new lead's. */
const idsOf = (items: TodayItem[]) => items.map((item) => (item.kind === "task" ? item.task.id : item.lead.id));

describe("today", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  /** A salesperson of their own: every test's items belong to a person no other test uses. */
  const aSalesperson = (): MemberAccess => memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
  const summaryOf = (access: MemberAccess, now: Date) => inOrg((tx) => todaySummary(tx, access, now));
  const sectionOf = (
    access: MemberAccess,
    section: TodaySectionName,
    now: Date,
    page: { after?: string; limit?: number } = {},
  ) => inOrg((tx) => todaySection(tx, access, { section, limit: 20, ...page }, now));

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Today");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("counts and lists my overdue tasks, new leads and today's tasks, and nobody else's", async () => {
    const me = aSalesperson();
    const someoneElse = randomUUID();
    const now = at("2026-10-17T06:30:00Z"); // 12:00 in India
    const ids = await inOrg(async (tx) => {
      const contacted = await aLead(tx, { ownerUserId: me.userId, stage: "contacted" });
      const onMyLead = { recordType: "lead", recordId: contacted.id };
      const mine = { assigneeUserId: me.userId };
      const seeded = {
        overdueTask: (await aTask(tx, { ...mine, dueAt: at("2026-10-17T04:00:00Z") })).id,
        overdueFollowUp: (
          await aTask(tx, { ...mine, kind: "follow-up", record: onMyLead, dueAt: at("2026-10-16T09:00:00Z") })
        ).id,
        dueToday: (await aTask(tx, { ...mine, dueAt: at("2026-10-17T10:00:00Z") })).id,
        newLead: (await aLead(tx, { ownerUserId: me.userId })).id,
      };
      await aTask(tx, { ...mine, dueAt: at("2026-10-17T03:00:00Z"), doneAt: now, doneBy: me.userId });
      await aTask(tx, { ...mine, dueAt: at("2026-10-17T03:00:00Z"), cancelledAt: now });
      await aTask(tx, { ...mine, dueAt: at("2026-10-18T03:30:00Z") }); // tomorrow at 09:00
      await aTask(tx, { assigneeUserId: someoneElse, dueAt: at("2026-10-17T04:00:00Z") });
      await aTask(tx, { assigneeUserId: someoneElse, dueAt: at("2026-10-17T10:00:00Z") });
      await aLead(tx, { ownerUserId: someoneElse });
      await aLead(tx, { ownerUserId: null });
      const gone = await aLead(tx, { ownerUserId: me.userId });
      await tx.lead.update({ where: { id: gone.id }, data: { deletedAt: now } });
      return seeded;
    });

    const summary = await summaryOf(me, now);
    expect(summary.day).toBe("2026-10-17");
    expect(summary.counts).toEqual({ overdue: 2, newLeads: 1, dueToday: 1, quoteOpened: 0, paymentsDue: 0 });
    expect(idsOf((await sectionOf(me, "overdue", now)).items)).toEqual([ids.overdueFollowUp, ids.overdueTask]);
    expect(idsOf((await sectionOf(me, "new-leads", now)).items)).toEqual([ids.newLead]);
    expect(idsOf((await sectionOf(me, "due-today", now)).items)).toEqual([ids.dueToday]);
    expect((await sectionOf(me, "overdue", now)).nextCursor).toBeNull();
  });

  it("splits overdue and due today at the agency's midnight", async () => {
    const me = aSalesperson();
    const ids = await inOrg(async (tx) => {
      const lead = await aLead(tx, { ownerUserId: me.userId, stage: "contacted" });
      const followUp = (dueAt: string) =>
        aTask(tx, {
          kind: "follow-up",
          assigneeUserId: me.userId,
          record: { recordType: "lead", recordId: lead.id },
          dueAt: at(dueAt),
        }).then((task) => task.id);
      return {
        yesterday: await followUp("2026-10-16T11:30:00Z"), // 16 Oct, 17:00 in India
        morning: await followUp("2026-10-17T04:30:00Z"), // 17 Oct, 10:00
        lateEvening: await followUp("2026-10-17T18:25:00Z"), // 17 Oct, 23:55
        pastMidnight: await followUp("2026-10-17T18:40:00Z"), // 18 Oct, 00:10
      };
    });

    const justAfterMidnight = at("2026-10-16T18:35:00Z"); // 17 Oct, 00:05 in India; still the 16th in UTC
    expect(await summaryOf(me, justAfterMidnight)).toMatchObject({
      day: "2026-10-17",
      counts: { overdue: 1, dueToday: 2 },
    });
    expect(idsOf((await sectionOf(me, "overdue", justAfterMidnight)).items)).toEqual([ids.yesterday]);
    expect(idsOf((await sectionOf(me, "due-today", justAfterMidnight)).items)).toEqual([ids.morning, ids.lateEvening]);

    const lateEvening = at("2026-10-17T18:20:00Z"); // 17 Oct, 23:50 in India
    expect(await summaryOf(me, lateEvening)).toMatchObject({
      day: "2026-10-17",
      counts: { overdue: 2, dueToday: 1 },
    });
    expect(idsOf((await sectionOf(me, "overdue", lateEvening)).items)).toEqual([ids.yesterday, ids.morning]);
    expect(idsOf((await sectionOf(me, "due-today", lateEvening)).items)).toEqual([ids.lateEvening]);
  });

  it("puts the first overdue, the oldest new lead and the next due today in the top three", async () => {
    const me = aSalesperson();
    const now = at("2026-10-17T06:30:00Z");
    const later = (hours: number) => new Date(now.getTime() + hours * HOUR_MS);
    const ids = await inOrg(async (tx) => {
      const mine = { assigneeUserId: me.userId };
      const secondOverdue = (await aTask(tx, { ...mine, dueAt: later(-1) })).id;
      const firstOverdue = (await aTask(tx, { ...mine, dueAt: later(-2) })).id;
      const oldestLead = (await aLead(tx, { ownerUserId: me.userId })).id;
      await aLead(tx, { ownerUserId: me.userId });
      const secondToday = (await aTask(tx, { ...mine, dueAt: later(2) })).id;
      const nextToday = (await aTask(tx, { ...mine, dueAt: later(1) })).id;
      return { firstOverdue, secondOverdue, oldestLead, nextToday, secondToday };
    });

    const { top } = await summaryOf(me, now);
    expect(top.map((item) => item.kind)).toEqual(["task", "new-lead", "task"]);
    expect(idsOf(top)).toEqual([ids.firstOverdue, ids.oldestLead, ids.nextToday]);

    const nothingOverdue = later(-3);
    expect(idsOf((await summaryOf(me, nothingOverdue)).top)).toEqual([ids.oldestLead, ids.firstOverdue]);
    expect(await summaryOf(aSalesperson(), now)).toMatchObject({
      counts: { overdue: 0, newLeads: 0, dueToday: 0, quoteOpened: 0, paymentsDue: 0 },
      top: [],
    });
  });

  it("lists new leads oldest first, 20 a page", async () => {
    const me = aSalesperson();
    const now = at("2026-10-17T06:30:00Z");
    const leads = await inOrg(async (tx) => {
      const made = [];
      for (let index = 0; index < 23; index += 1) {
        made.push(await aLead(tx, { ownerUserId: me.userId }));
      }
      return made;
    });
    // Oldest first is UUID v7 order, the order they were made in.
    const leadIds = leads.map((lead) => lead.id).sort();

    const first = await sectionOf(me, "new-leads", now);
    expect(idsOf(first.items)).toEqual(leadIds.slice(0, 20));
    expect(first.nextCursor).toBe(leadIds[19]);
    const second = await sectionOf(me, "new-leads", now, { after: first.nextCursor ?? "" });
    expect(idsOf(second.items)).toEqual(leadIds.slice(20));
    expect(second.nextCursor).toBeNull();
    expect((await summaryOf(me, now)).counts.newLeads).toBe(23);

    const [oldest] = first.items;
    const created = await inOrg((tx) =>
      tx.lead.findUniqueOrThrow({ where: { id: leadIds[0] ?? "" }, select: { createdAt: true } }),
    );
    expect(oldest).toMatchObject({ kind: "new-lead", waitingSince: created.createdAt.toISOString() });
  });

  it("brings each lead's name, phone and trip line with its task", async () => {
    const me = aSalesperson();
    const now = at("2026-10-17T06:30:00Z");
    const phone = freshPhone();
    const ids = await inOrg(async (tx) => {
      const person = await aPerson(tx, { name: "Priya Nair", phoneE164: phone });
      const kashmir = await tx.destination.create({ data: { name: `Kashmir ${randomUUID()}` } });
      const lead = await aLead(tx, {
        personId: person.id,
        ownerUserId: me.userId,
        stage: "contacted",
        destinationId: kashmir.id,
        travelKind: "month",
        travelMonth: at("2026-12-01T00:00:00Z"),
        adults: 2,
        childrenAges: [5],
        source: "referral",
      });
      const byEmail = await aPerson(tx, {
        name: "Kabir Rao",
        phoneE164: null,
        email: `kabir-${randomUUID()}@example.test`,
      });
      const newLead = await tx.lead.create({
        data: {
          personId: byEmail.id,
          ownerUserId: me.userId,
          source: "walk_in",
          travelKind: "dates",
          travelStart: at("2026-11-14T00:00:00Z"),
          travelEnd: at("2026-11-20T00:00:00Z"),
        },
      });
      const followUp = await aTask(tx, {
        kind: "follow-up",
        title: "Send the Kashmir quote",
        assigneeUserId: me.userId,
        record: { recordType: "lead", recordId: lead.id },
        dueAt: at("2026-10-17T10:00:00Z"),
      });
      const standalone = await aTask(tx, { assigneeUserId: me.userId, dueAt: at("2026-10-17T11:00:00Z") });
      const onSomethingElse = await aTask(tx, {
        assigneeUserId: me.userId,
        record: { recordType: "booking", recordId: randomUUID() },
        dueAt: at("2026-10-17T12:00:00Z"),
      });
      return { lead: lead.id, destination: kashmir.name, newLead: newLead.id, followUp, standalone, onSomethingElse };
    });

    const dueToday = (await sectionOf(me, "due-today", now)).items;
    expect(dueToday).toMatchObject([
      { kind: "task", task: { id: ids.followUp.id, kind: "follow-up", title: "Send the Kashmir quote" } },
      { kind: "task", task: { id: ids.standalone.id, record: null }, lead: null },
      { kind: "task", task: { id: ids.onSomethingElse.id }, lead: null },
    ]);
    expect(dueToday[0]?.lead).toEqual({
      id: ids.lead,
      personName: "Priya Nair",
      phone,
      trip: {
        destinationName: ids.destination,
        when: { kind: "month", month: "2026-12" },
        adults: 2,
        childrenCount: 1,
      },
      source: "referral",
    });

    const [waiting] = (await sectionOf(me, "new-leads", now)).items;
    expect(waiting).toMatchObject({
      kind: "new-lead",
      lead: {
        id: ids.newLead,
        personName: "Kabir Rao",
        phone: null,
        trip: {
          destinationName: null,
          when: { kind: "dates", from: "2026-11-14", to: "2026-11-20" },
          adults: null,
          childrenCount: 0,
        },
        source: "walk_in",
      },
    });
  });

  it("leaves out the brief of a lead the person can't see, beside a task of theirs on it", async () => {
    const me = aSalesperson();
    const now = at("2026-10-17T06:30:00Z");
    const onTheirLead = await inOrg(async (tx) => {
      const theirs = await aLead(tx, { ownerUserId: randomUUID(), stage: "contacted" });
      const record = { recordType: "lead", recordId: theirs.id };
      return aTask(tx, { kind: "follow-up", assigneeUserId: me.userId, record, dueAt: at("2026-10-17T10:00:00Z") });
    });
    expect((await sectionOf(me, "due-today", now)).items).toMatchObject([
      { kind: "task", task: { id: onTheirLead.id }, lead: null },
    ]);
    expect((await summaryOf(me, now)).top).toMatchObject([{ kind: "task", lead: null }]);
  });
});
