// Remembering who opens the installed app: one write a day per member and phone type, a 30-day memory, no one else's
// rows, and nothing from support's impersonation.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { installedAppPlatforms, recordInstalledAppVisit } from "../../src/usage/index.js";

const DAY = 24 * 60 * 60 * 1000;

describe("the installed app's visits", () => {
  let db: Database;
  let platform: PlatformClient;

  beforeAll(() => {
    const urls = inject("dbUrls");
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    platform = createPlatformClient(urls.platform);
  });
  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const memberIn = (organizationId: string, impersonatedBy: string | null = null) =>
    ({ organizationId, userId: randomUUID(), impersonatedBy }) as MemberAccess;
  const organization = () => createTestOrganization(platform, "Installed app agency");

  it("writes once a day: a second visit the same day changes nothing, the next day moves the time", async () => {
    const organizationId = await organization();
    const member = memberIn(organizationId);
    const start = new Date("2026-11-25T10:00:00Z");
    const times = async () =>
      (await platform.memberInstalledApp.findMany({ where: { organizationId, userId: member.userId } })).map((row) =>
        row.lastSeenAt.getTime(),
      );
    await db.forOrg(organizationId, (tx) => recordInstalledAppVisit(tx, member, "android", start));
    await db.forOrg(organizationId, (tx) =>
      recordInstalledAppVisit(tx, member, "android", new Date(start.getTime() + 2 * 60 * 60 * 1000)),
    );
    expect(await times()).toEqual([start.getTime()]);
    const nextDay = new Date(start.getTime() + DAY);
    await db.forOrg(organizationId, (tx) => recordInstalledAppVisit(tx, member, "android", nextDay));
    expect(await times()).toEqual([nextDay.getTime()]);
  });

  it("reads the phone types seen in the last 30 days, and not older ones", async () => {
    const organizationId = await organization();
    const member = memberIn(organizationId);
    const now = new Date("2026-11-25T10:00:00Z");
    await db.forOrg(organizationId, async (tx) => {
      await recordInstalledAppVisit(tx, member, "ios", new Date(now.getTime() - 29 * DAY));
      await recordInstalledAppVisit(tx, member, "android", new Date(now.getTime() - 31 * DAY));
    });
    expect(await db.forOrg(organizationId, (tx) => installedAppPlatforms(tx, member, now))).toEqual(["ios"]);
  });

  it("never reads another member's rows, or another organization's", async () => {
    const organizationId = await organization();
    const other = await organization();
    const member = memberIn(organizationId);
    const colleague = memberIn(organizationId);
    const now = new Date();
    await db.forOrg(organizationId, (tx) => recordInstalledAppVisit(tx, colleague, "ios", now));
    await db.forOrg(other, (tx) => recordInstalledAppVisit(tx, { ...member, organizationId: other }, "ios", now));
    expect(await db.forOrg(organizationId, (tx) => installedAppPlatforms(tx, member, now))).toEqual([]);
    // Even asked as the colleague's user id from the other organization, row-level security shows nothing.
    const stranger = { ...colleague, organizationId: other };
    expect(await db.forOrg(other, (tx) => installedAppPlatforms(tx, stranger, now))).toEqual([]);
  });

  it("notes nothing while support impersonates the member", async () => {
    const organizationId = await organization();
    const member = memberIn(organizationId, randomUUID());
    await db.forOrg(organizationId, (tx) => recordInstalledAppVisit(tx, member, "ios", new Date()));
    expect(await platform.memberInstalledApp.count({ where: { organizationId } })).toBe(0);
  });
});
