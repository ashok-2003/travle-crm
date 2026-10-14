// publishEvent writes the event in the caller's transaction: it exists exactly when the change commits, and only its
// own organization can see it.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { publishEvent } from "../../src/jobs/index.js";

describe("publishEvent", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let otherOrganizationId: string;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Events");
    otherOrganizationId = await createTestOrganization(platform, "Other events");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("records the event in the organization of the transaction, unrelayed", async () => {
    const id = await db.forOrg(organizationId, (tx) =>
      publishEvent(tx, { type: "document.issued", payload: { documentId: "d1", pages: 2 } }),
    );
    const event = await db.forOrg(organizationId, (tx) => tx.outboxEvent.findUnique({ where: { id } }));
    expect(event).toMatchObject({
      organizationId,
      type: "document.issued",
      payload: { documentId: "d1", pages: 2 },
      relayedAt: null,
    });
    expect(await db.forOrg(otherOrganizationId, (tx) => tx.outboxEvent.findUnique({ where: { id } }))).toBeNull();
  });

  it("leaves no event when the change's transaction rolls back", async () => {
    let id = "";
    await expect(
      db.forOrg(organizationId, async (tx) => {
        id = await publishEvent(tx, { type: "document.issued", payload: { documentId: "d2" } });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await db.forOrg(organizationId, (tx) => tx.outboxEvent.findUnique({ where: { id } }))).toBeNull();
  });

  it("refuses an event type that is not <entity>.<what happened>, before writing", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => publishEvent(tx, { type: "DocumentIssued", payload: {} })),
    ).rejects.toThrow(/Event types look like/);
  });
});
