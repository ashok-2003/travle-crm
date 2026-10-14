// notify() is the one service every module calls: a bell row per person, and a delivery event when email or push is
// wanted, all in the caller's transaction.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { notify } from "../../src/notifications/index.js";
import { eventsOfType, personIn } from "./test-support.js";

describe("notify", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  const asha = "0199e7a0-0000-7000-8000-00000000a5a0";
  const ravi = "0199e7a0-0000-7000-8000-00000000ba01";

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Notify");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("puts one notification in each person's bell, once, and asks for delivery by email and push", async () => {
    const ids = await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [asha, ravi, asha],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Meera opened Quotation QT-2026-0042",
        link: "/quotes/42",
        channels: ["email", "push"],
      }),
    );

    expect(ids).toHaveLength(2);
    const rows = await db.forOrg(organizationId, (tx) =>
      tx.notification.findMany({ where: { id: { in: ids } }, orderBy: { recipientUserId: "asc" } }),
    );
    expect(rows.map((row) => [row.recipientUserId, row.kind, row.link, row.readAt])).toEqual([
      [asha, "share-link.opened", "/quotes/42", null],
      [ravi, "share-link.opened", "/quotes/42", null],
    ]);
    const events = await eventsOfType(db, organizationId, "notification.created");
    expect(events.map((event) => event.payload)).toEqual(
      ids.map((notificationId) => ({ notificationId, channels: ["email", "push"] })),
    );
  });

  it("asks for no delivery when only the bell is wanted", async () => {
    const before = (await eventsOfType(db, organizationId, "notification.created")).length;
    await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [asha],
        kind: "staff.added",
        title: "Welcome Ravi",
        body: "Ravi joined",
      }),
    );
    expect(await eventsOfType(db, organizationId, "notification.created")).toHaveLength(before);
  });

  it("never notifies people about their own action", async () => {
    const ids = await db.forOrg(organizationId, (tx) =>
      notify(tx, personIn(organizationId, asha), {
        recipientUserIds: [asha, ravi],
        kind: "role.updated",
        title: "Roles changed",
        body: "Sales can now edit departures",
      }),
    );
    const rows = await db.forOrg(organizationId, (tx) => tx.notification.findMany({ where: { id: { in: ids } } }));
    expect(rows.map((row) => row.recipientUserId)).toEqual([ravi]);
  });

  it("refuses a link that leaves the web app, before writing anything", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        notify(tx, systemActor(organizationId), {
          recipientUserIds: [asha],
          kind: "share-link.opened",
          title: "Opened",
          body: "Opened",
          link: "//evil.example/login",
        }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_NOTIFICATION" });
  });

  it("leaves nothing behind when the caller's transaction rolls back", async () => {
    let ids: string[] = [];
    await expect(
      db.forOrg(organizationId, async (tx) => {
        ids = await notify(tx, systemActor(organizationId), {
          recipientUserIds: [ravi],
          kind: "share-link.opened",
          title: "Opened",
          body: "Opened",
          channels: ["email"],
        });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await db.forOrg(organizationId, (tx) => tx.notification.count({ where: { id: { in: ids } } }))).toBe(0);
  });
});
