// Erasing one person (spec 5): every notification sent to them, their opt-outs and their browsers go, in their
// organization only; the platform role does it, and the runtime role can't.
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { systemActor } from "../../src/kernel/index.js";
import { forgetRecipient, notify, setPreference } from "../../src/notifications/index.js";
import { personIn } from "./test-support.js";

describe("forgetting a person", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  const meera = "0199e7a0-0000-7000-8000-00000000f0a1";
  const ravi = "0199e7a0-0000-7000-8000-00000000f0a2";

  beforeAll(() => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  /** An organization where Meera and Ravi each have a notification, an opt-out and a browser. */
  async function organizationWithPeople(): Promise<string> {
    const organizationId = await createTestOrganization(platform, "Forgetting");
    await db.forOrg(organizationId, async (tx) => {
      await notify(tx, systemActor(organizationId), {
        recipientUserIds: [meera, ravi],
        kind: "share-link.opened",
        title: "Quotation opened",
        body: "Opened just now",
        channels: [],
      });
      for (const userId of [meera, ravi]) {
        await setPreference(tx, personIn(organizationId, userId), { channel: "email", kind: "*", optedOut: true });
        await tx.pushSubscription.create({
          data: { userId, endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`, p256dh: "key", auth: "secret" },
        });
      }
    });
    return organizationId;
  }

  it("deletes the person's notifications, opt-outs and browsers, and nobody else's", async () => {
    const organizationId = await organizationWithPeople();
    const elsewhere = await organizationWithPeople();
    expect(await platformDb.transaction((tx) => forgetRecipient(tx, { organizationId, userId: meera }))).toEqual({
      notifications: 1,
      preferences: 1,
      pushSubscriptions: 1,
    });
    const left = await db.forOrg(organizationId, async (tx) => ({
      notifications: await tx.notification.findMany({ select: { recipientUserId: true } }),
      preferences: await tx.notificationPreference.findMany({ select: { userId: true } }),
      browsers: await tx.pushSubscription.findMany({ select: { userId: true } }),
    }));
    expect(left).toEqual({
      notifications: [{ recipientUserId: ravi }],
      preferences: [{ userId: ravi }],
      browsers: [{ userId: ravi }],
    });
    expect(await db.forOrg(elsewhere, (tx) => tx.notification.count({ where: { recipientUserId: meera } }))).toBe(1);
  });

  it("can't be done by the runtime role", async () => {
    const organizationId = await organizationWithPeople();
    await expect(
      db.forOrg(organizationId, (tx) => forgetRecipient(tx, { organizationId, userId: ravi })),
    ).rejects.toThrow(/permission denied/);
  });
});
