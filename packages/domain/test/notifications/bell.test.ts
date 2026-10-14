// The bell shows each person only their own notifications, newest first, page by page, and only they mark them read.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { listNotifications, markRead, notify, unreadCount, type Person } from "../../src/notifications/index.js";
import { personIn } from "./test-support.js";

describe("the bell", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let ashaHere: Person;
  let raviHere: Person;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Bell");
    ashaHere = personIn(organizationId);
    raviHere = personIn(organizationId);
    for (const title of ["First", "Second", "Third"]) {
      await db.forOrg(organizationId, (tx) =>
        notify(tx, systemActor(organizationId), {
          recipientUserIds: [ashaHere.userId],
          kind: "share-link.opened",
          title,
          body: `${title} body`,
        }),
      );
    }
    await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [raviHere.userId],
        kind: "share-link.opened",
        title: "Ravi's",
        body: "Only for Ravi",
      }),
    );
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists a person's own notifications, newest first, a page at a time", async () => {
    const first = await db.forOrg(organizationId, (tx) => listNotifications(tx, ashaHere, { limit: 2 }));
    expect(first.notifications.map((notification) => notification.title)).toEqual(["Third", "Second"]);
    expect(first.nextCursor).toBe(first.notifications[1]?.id);

    const second = await db.forOrg(organizationId, (tx) =>
      listNotifications(tx, ashaHere, { limit: 2, cursor: first.nextCursor ?? undefined }),
    );
    expect(second.notifications.map((notification) => notification.title)).toEqual(["First"]);
    expect(second.nextCursor).toBeNull();
    expect(second.notifications[0]).toMatchObject({ kind: "share-link.opened", link: null, readAt: null });
    expect(second.notifications[0]?.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it("counts unread ones, and marks only the person's own as read", async () => {
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, ashaHere))).toBe(3);
    const { notifications } = await db.forOrg(organizationId, (tx) => listNotifications(tx, ashaHere, {}));
    const [ravisOwn] = (await db.forOrg(organizationId, (tx) => listNotifications(tx, raviHere, {}))).notifications;

    const marked = await db.forOrg(organizationId, (tx) =>
      markRead(tx, ashaHere, { notificationIds: [notifications[0]?.id ?? "", ravisOwn?.id ?? ""] }),
    );

    expect(marked).toBe(1);
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, ashaHere))).toBe(2);
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, raviHere))).toBe(1);
    expect(await db.forOrg(organizationId, (tx) => markRead(tx, ashaHere, { all: true }))).toBe(2);
    expect(await db.forOrg(organizationId, (tx) => unreadCount(tx, ashaHere))).toBe(0);
  });

  it("shows nothing from another organization", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Other bell");
    const ashaElsewhere = personIn(otherOrganizationId, ashaHere.userId);
    expect(
      (await db.forOrg(otherOrganizationId, (tx) => listNotifications(tx, ashaElsewhere, {}))).notifications,
    ).toEqual([]);
    expect(await db.forOrg(otherOrganizationId, (tx) => unreadCount(tx, ashaElsewhere))).toBe(0);
  });

  it("refuses an actor with no person, such as a job", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => listNotifications(tx, { ...systemActor(organizationId) }, {})),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "NOT_A_PERSON" });
  });
});
