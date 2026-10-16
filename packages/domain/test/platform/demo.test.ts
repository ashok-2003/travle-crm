// The nightly demo reset (spec 7.4: "one shared demo with realistic sample data, reset nightly by a job"): it builds
// the demo organization, and each night purges it and builds it again, so whatever visitors changed is gone. Its
// staff sign in with its code, their username and the demo password. It is on the demo's own plan, never one on sale,
// and it never touches an organization it didn't build, even one that has the demo's code. Its sample leads (spec 7)
// are in every stage, for its Owner and its salesperson, with notes, follow-ups and tasks timed from the reset.
import { randomUUID } from "node:crypto";
import { leadStages } from "@travel-crm/contracts/crm";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOrganizationRecord } from "../../src/identity/index.js";
import { addDays, calendarDateIn, startOfDayIn } from "../../src/kernel/index.js";
import { todaySummary } from "../../src/today/index.js";
import {
  listPlatformLog,
  onboardOrganization,
  resetDemoOrganization,
  type DemoSettings,
} from "../../src/platform/index.js";
import { getOrganizationProfile } from "../../src/profile/index.js";
import { DEMO_PLAN_KEY, getSubscription, listPlans } from "../../src/subscriptions/index.js";
import { canSignInByUsername, memberAccessOf } from "../identity/test-identity.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("the demo reset", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const demoSettings = (): DemoSettings => ({
    code: `D${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`,
    password: "demo-password-123",
  });

  const organizationEntries = (organizationId: string) =>
    test.services.platformDb.transaction(async (tx) =>
      (await listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 })).entries.map((entry) => ({
        action: entry.action,
        actorUserId: entry.actorUserId,
      })),
    );

  it("builds the demo on its own plan, whose staff sign in with its code and the demo password", async () => {
    const demo = demoSettings();
    // 20:00 UTC is already the 17th in India: the demo is paid a month from the day there.
    const { organizationId } = await resetDemoOrganization(test.services, demo, new Date("2026-10-16T20:00:00Z"));
    for (const username of ["asha", "ravi", "meena"]) {
      expect(await canSignInByUsername(test.identity.identity, demo.code, username, demo.password)).toBe(true);
    }
    const { subscription, onSale } = await test.services.platformDb.transaction(async (tx) => ({
      subscription: await getSubscription(tx, organizationId),
      onSale: await listPlans(tx, { includeArchived: false }),
    }));
    expect(subscription).toMatchObject({ status: "active", paidThrough: "2026-11-16", plan: { key: DEMO_PLAN_KEY } });
    // Plans are global: the demo's is never offered to an agency.
    expect(onSale.map((candidate) => candidate.key)).not.toContain(DEMO_PLAN_KEY);
    expect(
      await test.services.db.forOrg(organizationId, (tx) => getOrganizationProfile(tx, organizationId)),
    ).toMatchObject({
      legalName: "Demo Holidays Private Limited",
      invoicePrefix: "DH",
    });
    expect(await organizationEntries(organizationId)).toEqual([{ action: "demo.reset", actorUserId: null }]);
  });

  /** The demo's staff by username: their user ids. */
  const demoUsers = (organizationId: string) =>
    test.services.platformDb.transaction(async (tx) => {
      const members = await tx.member.findMany({ where: { organizationId }, select: { userId: true, user: true } });
      return new Map(members.map((member) => [member.user.displayUsername, member.userId]));
    });

  /** The demo's leads and what hangs off them, read in the demo organization. */
  const demoData = (organizationId: string) =>
    test.services.db.forOrg(organizationId, async (tx) => ({
      leads: await tx.lead.findMany({
        select: { id: true, personId: true, stage: true, ownerUserId: true, returning: true, createdAt: true },
        orderBy: { id: "asc" },
      }),
      people: await tx.person.findMany({ select: { id: true, phoneE164: true } }),
      destinations: await tx.destination.count(),
      notedLeads: (await tx.leadNote.groupBy({ by: ["leadId"] })).length,
      blocked: await tx.blockedContact.findMany({ select: { kind: true, value: true } }),
      tasks: await tx.task.findMany({ select: { kind: true, recordType: true, assigneeUserId: true } }),
    }));

  it("gives the demo leads in every stage, one returning, one blocked, with notes, for Asha and Ravi", async () => {
    const { organizationId } = await resetDemoOrganization(test.services, demoSettings());
    const users = await demoUsers(organizationId);
    const [asha, ravi] = [users.get("asha"), users.get("ravi")];
    const data = await demoData(organizationId);

    expect(data.leads).toHaveLength(13);
    expect(data.people).toHaveLength(11);
    expect(data.destinations).toBe(6);
    expect(new Set(data.leads.map((lead) => lead.stage))).toEqual(new Set(leadStages));
    expect(new Set(data.leads.map((lead) => lead.ownerUserId))).toEqual(new Set([asha, ravi]));
    const wonBefore = (lead: (typeof data.leads)[number]) =>
      data.leads.some(
        (earlier) =>
          earlier.personId === lead.personId && earlier.stage === "won" && earlier.createdAt < lead.createdAt,
      );
    expect(data.leads.filter((lead) => lead.returning && wonBefore(lead))).toHaveLength(1);
    const blockedPhones = new Set(data.blocked.filter((entry) => entry.kind === "phone").map((entry) => entry.value));
    const blockedLeads = data.leads.filter((lead) => {
      const phone = data.people.find((person) => person.id === lead.personId)?.phoneE164;
      return phone !== undefined && phone !== null && blockedPhones.has(phone);
    });
    expect(blockedLeads.map((lead) => lead.stage)).toEqual(["not_a_lead"]);
    expect(data.notedLeads).toBe(4);
    expect(data.tasks.filter((task) => task.kind === "follow-up" && task.recordType === "lead")).toHaveLength(7);
    expect(data.tasks.filter((task) => task.recordType === null)).toHaveLength(2);
    expect(data.tasks.every((task) => task.assigneeUserId === asha || task.assigneeUserId === ravi)).toBe(true);
  });

  it("gives Ravi's Today an overdue follow-up, a new lead and one due today", async () => {
    // 02:00 in India, when the console's nightly job runs, and an afternoon reset run by hand.
    for (const now of [new Date("2026-10-17T20:30:00Z"), new Date("2026-10-18T09:30:00Z")]) {
      const { organizationId } = await resetDemoOrganization(test.services, demoSettings(), now);
      const ravi = (await demoUsers(organizationId)).get("ravi") ?? "";
      const access = await memberAccessOf(test.identity.identity, ravi, organizationId);
      const today = await test.services.db.forOrg(organizationId, (tx) => todaySummary(tx, access, now));
      expect(today.counts.overdue).toBeGreaterThanOrEqual(1);
      expect(today.counts.newLeads).toBeGreaterThanOrEqual(1);
      expect(today.counts.dueToday).toBeGreaterThanOrEqual(1);
      expect(today.top.map((item) => item.kind)).toEqual(["task", "new-lead", "task"]);
    }
  });

  it("times the follow-ups two overdue, three due today and two later, even a minute before midnight", async () => {
    // 02:00 and 15:00 in India, and 23:59:30, when "later today" is half a minute long.
    const nows = ["2026-10-17T20:30:00Z", "2026-10-18T09:30:00Z", "2026-10-18T18:29:30Z"].map((iso) => new Date(iso));
    for (const now of nows) {
      const { organizationId } = await resetDemoOrganization(test.services, demoSettings(), now);
      const endsAt = startOfDayIn(addDays(calendarDateIn(now, "Asia/Kolkata"), 1), "Asia/Kolkata");
      const due = await test.services.db.forOrg(organizationId, (tx) =>
        tx.task.findMany({ where: { kind: "follow-up" }, select: { dueAt: true } }),
      );
      const split = [
        due.filter(({ dueAt }) => dueAt < now).length,
        due.filter(({ dueAt }) => dueAt >= now && dueAt < endsAt).length,
        due.filter(({ dueAt }) => dueAt >= endsAt).length,
      ];
      expect(split, now.toISOString()).toEqual([2, 3, 2]);
    }
  });

  it("dates each lead's stage change as its timeline does, before a past trip", async () => {
    const now = new Date("2026-10-17T20:30:00Z");
    const { organizationId } = await resetDemoOrganization(test.services, demoSettings(), now);
    const leads = await test.services.db.forOrg(organizationId, (tx) =>
      tx.lead.findMany({
        where: { stage: { not: "new" } },
        select: {
          stage: true,
          createdAt: true,
          stageChangedAt: true,
          firstReplyAt: true,
          travelStart: true,
          timeline: { where: { kind: "stage-changed" }, select: { occurredAt: true } },
        },
      }),
    );
    expect(leads).toHaveLength(11);
    for (const lead of leads) {
      expect(lead.timeline.map((entry) => entry.occurredAt)).toEqual([lead.stageChangedAt]);
      expect(lead.stageChangedAt > lead.createdAt && lead.stageChangedAt < now).toBe(true);
      expect(lead.firstReplyAt).toEqual(lead.stage === "not_a_lead" ? null : lead.stageChangedAt);
      if (lead.travelStart !== null && lead.travelStart < now)
        expect(lead.stageChangedAt < lead.travelStart).toBe(true);
    }
  });

  it("builds again the next night without a clash", async () => {
    const demo = demoSettings();
    const tonight = new Date("2026-10-17T20:30:00Z");
    await resetDemoOrganization(test.services, demo, tonight);
    const tomorrow = new Date(tonight.getTime() + 24 * 60 * 60 * 1000);
    const { organizationId } = await resetDemoOrganization(test.services, demo, tomorrow);
    const data = await demoData(organizationId);
    expect([data.leads.length, data.people.length, data.destinations, data.blocked.length]).toEqual([13, 11, 6, 1]);
  });

  it("purges last night's demo and builds it afresh", async () => {
    const demo = demoSettings();
    const first = await resetDemoOrganization(test.services, demo);
    const second = await resetDemoOrganization(test.services, demo);
    expect(second.organizationId).not.toBe(first.organizationId);
    await expect(
      test.services.platformDb.transaction((tx) => findOrganizationRecord(tx, first.organizationId)),
    ).rejects.toMatchObject({ reason: "ORGANIZATION_NOT_FOUND" });
    expect(await organizationEntries(first.organizationId)).toEqual([
      { action: "organization.purged", actorUserId: null },
      { action: "demo.reset", actorUserId: null },
    ]);
    expect(await canSignInByUsername(test.identity.identity, demo.code, "asha", demo.password)).toBe(true);
  });

  it("never purges an organization it didn't build, even one with the demo's code", async () => {
    const input = onboardingInput(plan);
    const { organizationId } = await onboardOrganization(test.services, support, input);
    await expect(resetDemoOrganization(test.services, { ...demoSettings(), code: input.code })).rejects.toMatchObject({
      reason: "DEMO_CODE_TAKEN",
    });
    await expect(
      test.services.platformDb.transaction((tx) => findOrganizationRecord(tx, organizationId)),
    ).resolves.toMatchObject({ code: input.code });
  });
});
