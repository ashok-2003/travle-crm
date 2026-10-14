// The relay's one SECURITY DEFINER function says which organizations have events waiting, and nothing more: the
// runtime role still sees no organization's events outside db.forOrg().
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("app_organizations_with_unrelayed_events", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let older: string;
  let newer: string;
  let quiet: string;

  const waiting = (max = 1000) =>
    db.withoutOrg(
      (tx) => tx.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM app_organizations_with_unrelayed_events(${max}::integer) AS organization_id`,
    );

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    older = await createTestOrganization(platform, "Relay older");
    newer = await createTestOrganization(platform, "Relay newer");
    quiet = await createTestOrganization(platform, "Relay quiet");
    for (const organizationId of [older, newer]) {
      await db.forOrg(organizationId, (tx) =>
        tx.outboxEvent.create({ data: { type: "relay.checked", payload: { secret: "never returned" } } }),
      );
    }
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("lists organizations with unrelayed events, oldest first, as ids and nothing else", async () => {
    const rows = await waiting();
    for (const row of rows) expect(Object.keys(row)).toEqual(["organization_id"]);
    const ids = rows.map((row) => row.organization_id);
    expect(ids).toContain(older);
    expect(ids).toContain(newer);
    expect(ids).not.toContain(quiet);
    expect(ids.indexOf(older)).toBeLessThan(ids.indexOf(newer));
    expect(await waiting(1)).toHaveLength(1);
  });

  it("drops an organization once its events are relayed", async () => {
    await db.forOrg(older, (tx) => tx.outboxEvent.updateMany({ data: { relayedAt: new Date() } }));
    const ids = (await waiting()).map((row) => row.organization_id);
    expect(ids).not.toContain(older);
    expect(ids).toContain(newer);
  });

  it("leaves the runtime role blind to events outside db.forOrg()", async () => {
    expect(await db.withoutOrg((tx) => tx.outboxEvent.count())).toBe(0);
  });

  it("clamps its limit to 1..1000, and returns nothing for a NULL limit", async () => {
    expect(await waiting(0)).toHaveLength(1);
    expect(await waiting(-5)).toHaveLength(1);
    expect(await waiting(1_000_000)).not.toHaveLength(0);
    const none = await db.withoutOrg(
      (tx) => tx.$queryRaw<unknown[]>`SELECT * FROM app_organizations_with_unrelayed_events(NULL::integer)`,
    );
    expect(none).toEqual([]);
  });

  it("returns at most 1000 organizations, however many are asked for", async () => {
    // Seeded for real (1005 organizations with one event each, in one statement each): fast enough, and it proves the
    // clamp itself rather than its expression. They are marked relayed again afterwards.
    await platform.$executeRaw`
      INSERT INTO organization (id, name, code, updated_at)
      SELECT gen_random_uuid(), 'Clamp ' || i, 'C' || lpad(i::text, 11, '0'), now() FROM generate_series(1, 1005) AS i`;
    await platform.$executeRaw`
      INSERT INTO outbox_event (organization_id, id, type, payload)
      SELECT id, gen_random_uuid(), 'relay.clamped', '{}'::jsonb FROM organization WHERE name LIKE 'Clamp %'`;
    try {
      expect(await waiting(5000)).toHaveLength(1000);
    } finally {
      await platform.$executeRaw`UPDATE outbox_event SET relayed_at = now() WHERE type = 'relay.clamped'`;
    }
  });

  it("can be called only by the runtime role", async () => {
    await expect(platform.$queryRaw`SELECT * FROM app_organizations_with_unrelayed_events(10)`).rejects.toThrow(
      /permission denied/i,
    );
  });
});
