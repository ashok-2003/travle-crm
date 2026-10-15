// Erasing one record (spec 5): the notifications about it go, those linking to it and those an event about it caused,
// in its organization only; the platform role does it, and the runtime role can't.
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
import { forgetRecordNotifications, notify } from "../../src/notifications/index.js";

const traveller = "0199e7a0-0000-7000-8000-00000000f1a1";
const otherTraveller = "0199e7a0-0000-7000-8000-00000000f1a2";
const meera = "0199e7a0-0000-7000-8000-00000000f1a3";
const opened = "0199e7a0-0000-7000-8000-00000000f1a4";

describe("forgetting a record's notifications", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;

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

  async function notified(organizationId: string, input: { link?: string; sourceEventId?: string; title: string }) {
    await db.forOrg(organizationId, (tx) =>
      notify(tx, systemActor(organizationId), {
        recipientUserIds: [meera],
        kind: "traveller.updated",
        body: "Just now",
        channels: [],
        ...input,
      }),
    );
  }

  it("deletes the record's notifications in its organization, and nobody else's", async () => {
    const organizationId = await createTestOrganization(platform, "Forgetting a record");
    const elsewhere = await createTestOrganization(platform, "Elsewhere");
    await notified(organizationId, { link: `/travellers/${traveller}`, title: "Asha's visa is due" });
    await notified(organizationId, { sourceEventId: opened, title: "Opened: Asha's visa papers" });
    await notified(organizationId, { link: `/travellers/${otherTraveller}`, title: "Ravi's tickets" });
    await notified(elsewhere, { link: `/travellers/${traveller}`, title: "Another agency's traveller" });

    const about = { organizationId, recordId: traveller, sourceEventIds: [opened] };
    expect(await platformDb.transaction((tx) => forgetRecordNotifications(tx, about))).toBe(2);
    expect((await platform.notification.findMany({ where: { organizationId } })).map((row) => row.title)).toEqual([
      "Ravi's tickets",
    ]);
    expect(await platform.notification.count({ where: { organizationId: elsewhere } })).toBe(1);
    expect(await platformDb.transaction((tx) => forgetRecordNotifications(tx, about))).toBe(0);
  });

  it("refuses the runtime role, and anything but a record's id", async () => {
    const organizationId = await createTestOrganization(platform, "Not forgetting");
    await notified(organizationId, { link: `/travellers/${traveller}`, title: "Asha's visa is due" });
    await expect(
      db.forOrg(organizationId, (tx) =>
        forgetRecordNotifications(tx, { organizationId, recordId: traveller, sourceEventIds: [] }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      platformDb.transaction((tx) =>
        forgetRecordNotifications(tx, { organizationId, recordId: "", sourceEventIds: [] }),
      ),
    ).rejects.toThrow(RangeError);
    expect(await platform.notification.count({ where: { organizationId } })).toBe(1);
  });
});
