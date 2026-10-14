// Each person sets their own opt-outs and push subscriptions; a browser that subscribes again moves to its new person.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  listPreferences,
  removePushSubscription,
  savePushSubscription,
  setPreference,
} from "../../src/notifications/index.js";
import { personIn } from "./test-support.js";

const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };

describe("notification preferences and push subscriptions", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Preferences");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("stores a person's choices per channel and kind, and changes them in place", async () => {
    const asha = personIn(organizationId);
    await db.forOrg(organizationId, (tx) => setPreference(tx, asha, { channel: "email", kind: "*", optedOut: true }));
    await db.forOrg(organizationId, (tx) =>
      setPreference(tx, asha, { channel: "email", kind: "share-link.opened", optedOut: false }),
    );
    await db.forOrg(organizationId, (tx) => setPreference(tx, asha, { channel: "email", kind: "*", optedOut: false }));

    expect(await db.forOrg(organizationId, (tx) => listPreferences(tx, asha))).toEqual([
      { channel: "email", kind: "*", optedOut: false },
      { channel: "email", kind: "share-link.opened", optedOut: false },
    ]);
    expect(await db.forOrg(organizationId, (tx) => listPreferences(tx, personIn(organizationId)))).toEqual([]);
  });

  it("refuses an invalid preference", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        setPreference(tx, personIn(organizationId), { channel: "email", kind: "Everything", optedOut: true }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_PREFERENCE" });
  });

  it("keeps one subscription per browser, moving it to whoever subscribed last", async () => {
    const asha = personIn(organizationId);
    const ravi = personIn(organizationId);
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared-tablet";
    await db.forOrg(organizationId, (tx) => savePushSubscription(tx, asha, { endpoint, keys }));
    await db.forOrg(organizationId, (tx) => savePushSubscription(tx, ravi, { endpoint, keys }));

    const rows = await db.forOrg(organizationId, (tx) => tx.pushSubscription.findMany({ where: { endpoint } }));
    expect(rows.map((row) => row.userId)).toEqual([ravi.userId]);
  });

  it("refuses a push endpoint that isn't https", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        savePushSubscription(tx, personIn(organizationId), { endpoint: "http://push.example/x", keys }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_PUSH_SUBSCRIPTION" });
  });

  it("removes only the person's own subscription", async () => {
    const asha = personIn(organizationId);
    const ravi = personIn(organizationId);
    const endpoint = "https://fcm.googleapis.com/fcm/send/asha-only";
    await db.forOrg(organizationId, (tx) => savePushSubscription(tx, asha, { endpoint, keys }));

    expect(await db.forOrg(organizationId, (tx) => removePushSubscription(tx, ravi, { endpoint }))).toBe(false);
    expect(await db.forOrg(organizationId, (tx) => removePushSubscription(tx, asha, { endpoint }))).toBe(true);
    expect(await db.forOrg(organizationId, (tx) => tx.pushSubscription.count({ where: { endpoint } }))).toBe(0);
  });

  it("refuses an https endpoint that is not a known push service, so the worker never calls it", async () => {
    for (const endpoint of ["https://push.example/x", "https://169.254.169.254/latest", "https://localhost/x"]) {
      await expect(
        db.forOrg(organizationId, (tx) => savePushSubscription(tx, personIn(organizationId), { endpoint, keys })),
        endpoint,
      ).rejects.toMatchObject({ code: "VALIDATION", reason: "INVALID_PUSH_SUBSCRIPTION" });
    }
  });
});
