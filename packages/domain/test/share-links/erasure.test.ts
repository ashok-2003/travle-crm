// Erasing one record (spec 5): its share links and every open recorded against them go, with the ids of the events
// those opens published; other records' links stay; the platform role does it, and the runtime role can't.
import { createDatabase, type Database } from "@travel-crm/db";
import {
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import type { Actor } from "../../src/kernel/index.js";
import {
  createShareLink,
  findShareLink,
  forgetRecordShareLinks,
  recordShareLinkOpen,
} from "../../src/share-links/index.js";

const traveller = "0199e7a0-0000-7000-8000-00000000f2a1";
const otherTraveller = "0199e7a0-0000-7000-8000-00000000f2a2";
const visitor = { ipAddress: "203.0.113.9", userAgent: "Mobile Safari", preview: false };

describe("forgetting a record's share links", () => {
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

  async function sharedAndOpened(agent: Actor, recordId: string, label: string) {
    const link = await db.forOrg(agent.organizationId, (tx) =>
      createShareLink(tx, agent, { recordType: "traveller", recordId, label }),
    );
    await recordShareLinkOpen(db, await findShareLink(db, link.token), visitor);
    return link.shareLinkId;
  }

  it("deletes the record's links and their opens, and names the events their opens published", async () => {
    const organizationId = await createTestOrganization(platform, "Forgetting links");
    const agent: Actor = {
      organizationId,
      userId: "0199e7a0-0000-7000-8000-00000000f2a3",
      source: "web",
      impersonatedBy: null,
    };
    const erased = await sharedAndOpened(agent, traveller, "Visa papers for Asha Mehta");
    const kept = await sharedAndOpened(agent, otherTraveller, "Ravi's tickets");
    const record = { organizationId, recordType: "traveller", recordId: traveller };

    const forgotten = await platformDb.transaction((tx) => forgetRecordShareLinks(tx, record));
    const events = await platform.outboxEvent.findMany({ where: { organizationId, type: "share-link.opened" } });
    const eventOf = (shareLinkId: string) =>
      events.find((event) => (event.payload as { shareLinkId: string }).shareLinkId === shareLinkId)?.id;
    expect(forgotten).toEqual({ shareLinks: 1, opens: 1, openedEventIds: [eventOf(erased)] });
    expect(await platform.shareLink.findMany({ where: { organizationId }, select: { id: true } })).toEqual([
      { id: kept },
    ]);
    expect(await platform.shareLinkOpen.count({ where: { organizationId } })).toBe(1);
    expect(await platformDb.transaction((tx) => forgetRecordShareLinks(tx, record))).toEqual({
      shareLinks: 0,
      opens: 0,
      openedEventIds: [],
    });
  });

  it("can't be done by the runtime role", async () => {
    const organizationId = await createTestOrganization(platform, "Keeping links");
    const agent: Actor = {
      organizationId,
      userId: "0199e7a0-0000-7000-8000-00000000f2a4",
      source: "web",
      impersonatedBy: null,
    };
    await sharedAndOpened(agent, traveller, "Visa papers");
    await expect(
      db.forOrg(organizationId, (tx) =>
        forgetRecordShareLinks(tx, { organizationId, recordType: "traveller", recordId: traveller }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
