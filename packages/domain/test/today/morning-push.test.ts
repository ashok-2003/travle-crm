// The morning push (release 5, spec 3.3): at each person's time in the agency's zone, the plain count of their day to
// their own phone, once a day; nothing for a person with no phone, one who switched it off, or a day with nothing in it.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database, type OrgTx } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { morningWords, runMorningPushFor, type MorningPushDependencies } from "../../src/today/index.js";
import { aLead, aTask } from "../crm/support/records.js";
import { memberWithStarterRole } from "../identity/rule-helpers.js";

const IST = "Asia/Kolkata";
/** 17 Oct 2026, 09:05 in India. */
const nineOhFive = new Date("2026-10-17T03:35:00Z");
const quiet = { error: () => undefined } as unknown as MorningPushDependencies["logger"];

describe("the morning push", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let access: "full" | "locked" = "full";

  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>): Promise<T> => db.forOrg(organizationId, work);
  const people = new Map<string, MemberAccess>();
  const dependencies = (): MorningPushDependencies => ({
    db,
    logger: quiet,
    subscriptions: { entitlementsOf: () => Promise.resolve({ access } as never) },
    identity: {
      organizationsPage: () => Promise.resolve([{ id: organizationId, timeZone: IST }]),
      memberContacts: (_organization, userIds) =>
        Promise.resolve(userIds.filter((id) => people.has(id)).map((userId) => ({ userId, name: "A", email: null }))),
      resolveAccess: (userId) => Promise.resolve(people.get(userId) ?? null),
    },
  });
  const run = (now = nineOhFive) => runMorningPushFor(dependencies(), { id: organizationId, timeZone: IST }, now);
  const pushes = (member: MemberAccess) =>
    inOrg((tx) => tx.notification.findMany({ where: { recipientUserId: member.userId, kind: "today.morning" } }));

  /** A salesperson with a phone for push, two follow-ups overdue and one due later today. */
  const aBusyPerson = async (options: { phone?: boolean } = {}) => {
    const member = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    people.set(member.userId, member);
    await inOrg(async (tx) => {
      if (options.phone !== false) {
        await tx.pushSubscription.create({
          data: { userId: member.userId, endpoint: `https://push.example/${randomUUID()}`, p256dh: "k", auth: "s" },
        });
      }
      const lead = await aLead(tx, { ownerUserId: member.userId, stage: "contacted" });
      const onLead = { recordType: "lead", recordId: lead.id };
      const mine = { assigneeUserId: member.userId, kind: "follow-up" as const, record: onLead };
      await aTask(tx, { ...mine, dueAt: new Date("2026-10-16T05:00:00Z") });
      await aTask(tx, { ...mine, dueAt: new Date("2026-10-17T02:00:00Z") });
      await aTask(tx, { ...mine, dueAt: new Date("2026-10-17T10:00:00Z") });
    });
    return member;
  };

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Morning push");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("words the count", () => {
    expect(morningWords({ total: 8, overdue: 2 })).toBe("8 things today, 2 overdue");
    expect(morningWords({ total: 3, overdue: 0 })).toBe("3 things today");
    expect(morningWords({ total: 1, overdue: 1 })).toBe("1 thing today, 1 overdue");
    expect(morningWords({ total: 0, overdue: 0 })).toBeNull();
  });

  it("pushes the count at 09:00 to a person with a phone, with no names in it, and only once that day", async () => {
    const me = await aBusyPerson();
    expect(await run()).toBeGreaterThanOrEqual(1);
    const [first] = await pushes(me);
    expect(first).toMatchObject({ title: "3 things today, 2 overdue", link: "/today" });
    expect(JSON.stringify(first)).not.toMatch(/Rahul|\+91/);
    expect(await run(new Date(nineOhFive.getTime() + 30 * 60_000))).toBe(0);
    expect(await pushes(me)).toHaveLength(1);
    // The next day it goes again.
    await run(new Date(nineOhFive.getTime() + 24 * 3_600_000));
    expect(await pushes(me)).toHaveLength(2);
  });

  it("waits for the person's own time, and leaves a morning missed by hours", async () => {
    const me = await aBusyPerson();
    await inOrg((tx) => tx.morningPushSetting.create({ data: { userId: me.userId, localTime: "10:30" } }));
    await run(nineOhFive);
    expect(await pushes(me)).toHaveLength(0);
    await run(new Date("2026-10-17T05:10:00Z")); // 10:40
    expect(await pushes(me)).toHaveLength(1);
    const late = await aBusyPerson();
    await run(new Date("2026-10-17T12:00:00Z")); // 17:30, over two hours after 09:00
    expect(await pushes(late)).toHaveLength(0);
  });

  it("sends nothing to someone who switched it off, has no phone, or has nothing to do", async () => {
    const off = await aBusyPerson();
    await inOrg((tx) => tx.morningPushSetting.create({ data: { userId: off.userId, enabled: false } }));
    const noPhone = await aBusyPerson({ phone: false });
    const idle = memberWithStarterRole("sales", { organizationId, userId: randomUUID() });
    people.set(idle.userId, idle);
    await inOrg((tx) =>
      tx.pushSubscription.create({
        data: { userId: idle.userId, endpoint: `https://push.example/${randomUUID()}`, p256dh: "k", auth: "s" },
      }),
    );
    await run();
    expect(await pushes(off)).toHaveLength(0);
    expect(await pushes(noPhone)).toHaveLength(0);
    expect(await pushes(idle)).toHaveLength(0);
  });

  it("sends nothing for an agency whose subscription locks its staff out", async () => {
    const me = await aBusyPerson();
    access = "locked";
    try {
      expect(await run()).toBe(0);
    } finally {
      access = "full";
    }
    expect(await pushes(me)).toHaveLength(0);
  });
});
