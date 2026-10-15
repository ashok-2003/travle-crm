// Who writes and changes the organizations' audit log: an admin acting from the console is recorded under their own
// name with source platform; the platform may redact an entry's snapshots (an erasure) but never rewrite who did what;
// the api and the worker can change nothing.
import { createDatabase, type Database } from "@travel-crm/db";
import {
  asOrganization,
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listAuditEntries, recordAudit } from "../../src/audit/index.js";
import { platformActor, type Actor } from "../../src/kernel/index.js";

const ownerUserId = "0199e7a0-0000-7000-8000-0000000000f1";

describe("who writes and changes audit entries", () => {
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationId: string;
  let owner: Actor;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 1 });
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Platform audit");
    owner = { organizationId, userId: ownerUserId, source: "web", impersonatedBy: null };
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  const entriesFor = (entityId: string) =>
    db.forOrg(organizationId, (tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));

  it("records a platform admin acting from the console under their own name, with source platform", async () => {
    const adminUserId = "0199e7a0-0000-7000-8000-0000000000f4";
    const ownerMemberId = "0199e7a0-0000-7000-8000-0000000000f5";
    // The console writes an organization's log from a platform transaction, stepped into the organization.
    await platformDb.transaction((tx) =>
      asOrganization(tx, organizationId, (orgTx) =>
        recordAudit(orgTx, platformActor(organizationId, adminUserId), {
          action: "staff.created",
          entityType: "member",
          entityId: ownerMemberId,
          after: { role: "owner", hasEmail: true },
        }),
      ),
    );
    const page = await db.forOrg(organizationId, (tx) =>
      listAuditEntries(tx, { entityType: "member", entityId: ownerMemberId, limit: 10 }),
    );
    expect(page.entries).toEqual([
      expect.objectContaining({ actorUserId: adminUserId, source: "platform", impersonatedBy: null }),
    ]);
  });

  it("lets the platform redact an entry's snapshots, but not rewrite who did what", async () => {
    const entityId = "0199e7a0-0000-7000-8000-00000000010b";
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, owner, { action: "role.updated", entityType: "role", entityId, after: { name: "Visa" } }),
    );
    await expect(
      platform.$executeRaw`UPDATE audit_entry SET after = NULL WHERE entity_id = ${entityId}::uuid`,
    ).resolves.toBe(1);
    expect((await entriesFor(entityId))[0]?.after).toBeNull();
    await expect(
      platform.$executeRaw`UPDATE audit_entry SET actor_user_id = NULL WHERE entity_id = ${entityId}::uuid`,
    ).rejects.toThrow(/permission denied/i);
    await expect(
      platform.$executeRaw`UPDATE audit_entry SET action = 'role.deleted' WHERE entity_id = ${entityId}::uuid`,
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps entries fixed: the api and worker can't change, delete or truncate them", async () => {
    await expect(db.forOrg(organizationId, (tx) => tx.$executeRaw`TRUNCATE audit_entry`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(
      db.forOrg(organizationId, (tx) => tx.$executeRaw`UPDATE audit_entry SET after = '{"name": "changed"}'::jsonb`),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.forOrg(organizationId, (tx) => tx.$executeRaw`DELETE FROM audit_entry`)).rejects.toThrow(
      /permission denied/i,
    );
  });
});
