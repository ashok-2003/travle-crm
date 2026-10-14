// The outbox table's own rules: well-formed event types and payloads, and events that can only be marked relayed.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("outbox table", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Outbox");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it('only accepts event types like "document.issued" and payloads that are JSON objects', async () => {
    const insert = (type: string, payload: unknown) =>
      db.forOrg(
        organizationId,
        (tx) => tx.$executeRaw`INSERT INTO outbox_event (id, type, payload)
        VALUES (gen_random_uuid(), ${type}, ${JSON.stringify(payload)}::jsonb)`,
      );
    expect(await insert("document.issued", { documentId: "d1" })).toBe(1);
    await expect(insert("DocumentIssued", {})).rejects.toThrow(/outbox_event_type_format/);
    await expect(insert("document", {})).rejects.toThrow(/outbox_event_type_format/);
    await expect(insert("document.issued", ["not", "an", "object"])).rejects.toThrow(/outbox_event_payload_object/);
  });

  it("lets the api and worker mark an event relayed, and change nothing else", async () => {
    const event = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.create({ data: { type: "document.issued", payload: { documentId: "d2" } } }),
    );
    const relayed = await db.forOrg(organizationId, (tx) =>
      tx.outboxEvent.update({ where: { id: event.id }, data: { relayedAt: new Date() } }),
    );
    expect(relayed.relayedAt).toBeInstanceOf(Date);
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.outboxEvent.update({ where: { id: event.id }, data: { payload: { documentId: "changed" } } }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
