// The tables without organization_id (webhook_event, rate_limit_counter) have no row-level security, so organization
// transactions can't reach them: OrgTx and IdentityTx leave their models out, and a cast past the types is refused at
// run time. Only their own modules reach them, inside db.withoutOrg(), through @travel-crm/db/webhooks and
// @travel-crm/db/rate-limits (dependency-cruiser keeps each entry point to its module).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { UnscopedModelError } from "../src/errors.js";
import type { IdentityTx, OrgTx } from "../src/for-org.js";
import { createIdentityDatabase, type IdentityClient, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { rateLimitCounters } from "../src/rate-limits.js";
import { webhookEvents } from "../src/webhooks.js";
import { createTestOrganization } from "./helpers.js";

/** Reaches for a model by name, as a cast past the types would. */
const reachFor = (tx: object, model: string) => Promise.resolve(Reflect.get(tx, model) as unknown);

describe("tables without organization_id", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identity: IdentityDatabase;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    identity = createIdentityDatabase(urls.runtime, { maxConnections: 1 });
    organizationId = await createTestOrganization(platform, "Unscoped tables");
  });

  afterAll(async () => {
    await identity.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("are missing from OrgTx, IdentityTx and the identity module's client", () => {
    // Compile-time checks: `pnpm typecheck` fails if any of these types exposes them again.
    const hidden = (tx: OrgTx, identityTx: IdentityTx, client: IdentityClient): unknown[] => [
      // @ts-expect-error webhook_event has no row-level security, so OrgTx leaves it out
      tx.webhookEvent,
      // @ts-expect-error rate_limit_counter has no row-level security, so OrgTx leaves it out
      tx.rateLimitCounter,
      // @ts-expect-error IdentityTx reaches the sign-in tables, not webhook_event
      identityTx.webhookEvent,
      // @ts-expect-error nor rate_limit_counter
      identityTx.rateLimitCounter,
      // @ts-expect-error the client Better Auth uses reaches its own tables, not webhook_event
      client.webhookEvent,
      // @ts-expect-error nor rate_limit_counter
      client.rateLimitCounter,
    ];
    expect(typeof hidden).toBe("function");
  });

  it("are refused at run time when a cast reaches past the types", async () => {
    for (const model of ["webhookEvent", "rateLimitCounter"]) {
      await expect(db.forOrg(organizationId, (tx) => reachFor(tx, model))).rejects.toBeInstanceOf(UnscopedModelError);
      await expect(identity.forOrg(organizationId, (tx) => reachFor(tx, model))).rejects.toBeInstanceOf(
        UnscopedModelError,
      );
      // withoutOrg()'s transaction too: only the entry points reach through it.
      await expect(db.withoutOrg((tx) => reachFor(tx, model))).rejects.toBeInstanceOf(UnscopedModelError);
      // And the identity module's client, which queries outside any transaction.
      expect(() => Reflect.get(identity.client, model) as unknown).toThrow(UnscopedModelError);
    }
  });

  it("refuse their entry points inside forOrg()", async () => {
    await expect(db.forOrg(organizationId, (tx) => webhookEvents(tx).count())).rejects.toBeInstanceOf(
      UnscopedModelError,
    );
    await expect(db.forOrg(organizationId, (tx) => rateLimitCounters(tx).count())).rejects.toBeInstanceOf(
      UnscopedModelError,
    );
  });

  it("are reached through their entry points inside withoutOrg()", async () => {
    const providerEventId = randomUUID();
    const stored = await db.withoutOrg(async (tx) => {
      await webhookEvents(tx).create({
        data: { provider: "example", providerEventId, eventType: "probe", headers: {}, payload: "{}" },
      });
      return webhookEvents(tx).count({ where: { providerEventId } });
    });
    expect(stored).toBe(1);

    const key = "a".repeat(64);
    const counted = await db.withoutOrg(async (tx) => {
      await rateLimitCounters(tx).create({ data: { key, windowStart: new Date(), count: 1 } });
      return rateLimitCounters(tx).count({ where: { key } });
    });
    expect(counted).toBe(1);
  });

  it("leave the rest of withoutOrg()'s transaction working", async () => {
    const [row] = await db.withoutOrg((tx) => tx.$queryRaw<{ one: number }[]>`SELECT 1 AS one`);
    expect(row?.one).toBe(1);
    expect(await db.withoutOrg((tx) => tx.orgCounter.count())).toBe(0);
  });
});
