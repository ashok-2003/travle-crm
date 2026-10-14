// recordAudit writes one entry in the change's own transaction: who acted, from where, and what changed. Entries are
// fixed once written, and never hold secrets.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { recordAudit, type AuditSnapshot } from "../../src/audit/index.js";
import { systemActor, type Actor } from "../../src/kernel/index.js";

const ownerUserId = "0199e7a0-0000-7000-8000-0000000000f1";
const supportUserId = "0199e7a0-0000-7000-8000-0000000000f2";
const memberId = "0199e7a0-0000-7000-8000-0000000000f3";

describe("recordAudit", () => {
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  let owner: Actor;

  beforeAll(async () => {
    const urls = inject("dbUrls");
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Audit");
    owner = { organizationId, userId: ownerUserId, source: "web", impersonatedBy: null };
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  const entriesFor = (entityId: string) =>
    db.forOrg(organizationId, (tx) => tx.auditEntry.findMany({ where: { entityId }, orderBy: { id: "asc" } }));

  it("stores who acted, from where, and the state before and after", async () => {
    const roleId = "0199e7a0-0000-7000-8000-000000000101";
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, owner, {
        action: "role.updated",
        entityType: "role",
        entityId: roleId,
        before: { name: "Sales", permissions: [{ permission: "leads:view", scope: "own" }] },
        after: { name: "Senior sales", permissions: [{ permission: "leads:view", scope: "all" }] },
      }),
    );
    expect(await entriesFor(roleId)).toEqual([
      expect.objectContaining({
        organizationId,
        actorUserId: ownerUserId,
        source: "web",
        impersonatedBy: null,
        action: "role.updated",
        entityType: "role",
        entityId: roleId,
        before: { name: "Sales", permissions: [{ permission: "leads:view", scope: "own" }] },
        after: { name: "Senior sales", permissions: [{ permission: "leads:view", scope: "all" }] },
      }),
    ]);
  });

  it("stores no state for a side that has none, and the system as an actor with no user", async () => {
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, systemActor(organizationId), {
        action: "staff.created",
        entityType: "member",
        entityId: memberId,
        after: { name: "Asha Owner" },
      }),
    );
    expect(await entriesFor(memberId)).toEqual([
      expect.objectContaining({ actorUserId: null, source: "job", before: null, after: { name: "Asha Owner" } }),
    ]);
  });

  it("is written in the change's transaction: a rollback leaves no entry", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000102";
    await expect(
      db.forOrg(organizationId, async (tx) => {
        await recordAudit(tx, owner, { action: "staff.removed", entityType: "member", entityId });
        throw new Error("the change failed");
      }),
    ).rejects.toThrow("the change failed");
    expect(await entriesFor(entityId)).toEqual([]);
  });

  it("records support's impersonation with the admin's id, and refuses one that doesn't name the admin", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000103";
    const impersonated: Actor = { ...owner, source: "impersonation", impersonatedBy: supportUserId };
    await db.forOrg(organizationId, (tx) =>
      recordAudit(tx, impersonated, { action: "staff.password-reset", entityType: "member", entityId }),
    );
    expect(await entriesFor(entityId)).toEqual([
      expect.objectContaining({ actorUserId: ownerUserId, source: "impersonation", impersonatedBy: supportUserId }),
    ]);
    const unnamed: Actor = { ...owner, source: "impersonation", impersonatedBy: null };
    await expect(
      db.forOrg(organizationId, (tx) =>
        recordAudit(tx, unnamed, { action: "staff.password-reset", entityType: "member", entityId }),
      ),
    ).rejects.toThrow(/audit_entry_impersonation/);
  });

  it("refuses a snapshot holding anything that looks like a secret, before writing", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000104";
    const attempt = (after: AuditSnapshot) =>
      db.forOrg(organizationId, (tx) =>
        recordAudit(tx, owner, { action: "staff.created", entityType: "member", entityId, after }),
      );
    await expect(attempt({ name: "Ravi", password: "temporary-pass-1" })).rejects.toThrow(
      /never hold secrets.*password/,
    );
    await expect(attempt({ account: { tokenHash: "x" } })).rejects.toThrow(/account\.tokenHash/);
    await expect(attempt({ codes: [{ backupSecret: "x" }] })).rejects.toThrow(/codes\.0\.backupSecret/);
    expect(await entriesFor(entityId)).toEqual([]);
  });

  it("refuses actions and record kinds that aren't well formed", async () => {
    const entityId = "0199e7a0-0000-7000-8000-000000000105";
    const attempt = (action: string, entityType: string) =>
      db.forOrg(organizationId, (tx) => recordAudit(tx, owner, { action, entityType, entityId }));
    await expect(attempt("StaffRemoved", "member")).rejects.toThrow(/Audit actions look like/);
    await expect(attempt("staff.removed", "Member")).rejects.toThrow(/record kinds look like/);
  });

  it("can't record an actor of another organization here", async () => {
    const otherOrganizationId = await createTestOrganization(platform, "Other audit");
    const outsider: Actor = { ...owner, organizationId: otherOrganizationId };
    await expect(
      db.forOrg(organizationId, (tx) =>
        recordAudit(tx, outsider, {
          action: "staff.removed",
          entityType: "member",
          entityId: "0199e7a0-0000-7000-8000-000000000106",
        }),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps entries fixed: the api and worker can't change or delete them", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => tx.$executeRaw`UPDATE audit_entry SET after = '{"name": "changed"}'::jsonb`),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.forOrg(organizationId, (tx) => tx.$executeRaw`DELETE FROM audit_entry`)).rejects.toThrow(
      /permission denied/i,
    );
  });
});
