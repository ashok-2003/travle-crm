// Soft delete (spec section 5): deleted rows disappear from reads and updates, hard deletes are refused,
// and withDeleted() brings deleted rows back into view for Trash screens and restoring.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { createIdentityDatabase, type IdentityDatabase } from "../src/identity.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { HardDeleteError, SoftDeleteUpsertError, softDeleted, withDeleted } from "../src/soft-delete.js";
import { createTestOrganization } from "./helpers.js";

describe("soft delete", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let identityDatabase: IdentityDatabase;
  let organizationId: string;
  let deletedRoleId: string;
  const deletedBy = "0199c3a2-0000-7000-8000-000000000001";

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    identityDatabase = createIdentityDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Soft delete");
    deletedRoleId = await db.forOrg(organizationId, async (tx) => {
      await tx.role.create({ data: { key: "kept", name: "Kept" } });
      const role = await tx.role.create({ data: { key: "binned", name: "Binned" } });
      await tx.role.update({ where: { id: role.id }, data: softDeleted(deletedBy) });
      return role.id;
    });
  });

  afterAll(async () => {
    await identityDatabase.disconnect();
    await db.disconnect();
    await platform.$disconnect();
  });

  it("records when and by whom a row was deleted", async () => {
    const role = await withDeleted(() =>
      db.forOrg(organizationId, (tx) => tx.role.findUnique({ where: { id: deletedRoleId } })),
    );
    expect(role?.deletedBy).toBe(deletedBy);
    expect(role?.deletedAt).toBeInstanceOf(Date);
  });

  it("hides deleted rows from finds and counts", async () => {
    const keys = await db.forOrg(organizationId, async (tx) => (await tx.role.findMany()).map((role) => role.key));
    expect(keys).toEqual(["kept"]);
    expect(await db.forOrg(organizationId, (tx) => tx.role.findUnique({ where: { id: deletedRoleId } }))).toBeNull();
    expect(await db.forOrg(organizationId, (tx) => tx.role.count({ where: { key: "binned" } }))).toBe(0);
  });

  it("does not update deleted rows", async () => {
    await expect(
      db.forOrg(organizationId, (tx) => tx.role.update({ where: { id: deletedRoleId }, data: { name: "Changed" } })),
    ).rejects.toThrow(/not found|No record/i);
    expect(await db.forOrg(organizationId, (tx) => tx.role.updateMany({ data: { name: "Renamed" } }))).toEqual({
      count: 1,
    });
  });

  it("refuses hard deletes before touching the database, leaving the transaction usable", async () => {
    const stillThere = await db.forOrg(organizationId, async (tx) => {
      await expect(tx.role.deleteMany()).rejects.toBeInstanceOf(HardDeleteError);
      await expect(tx.role.delete({ where: { id: deletedRoleId } })).rejects.toBeInstanceOf(HardDeleteError);
      return tx.role.count();
    });
    expect(stillThere).toBe(1);
  });

  it("shows deleted rows inside withDeleted(), inside or around forOrg()", async () => {
    const inside = await db.forOrg(organizationId, (tx) =>
      withDeleted(() => tx.role.findMany({ where: { deletedAt: { not: null } } })),
    );
    expect(inside.map((role) => role.id)).toEqual([deletedRoleId]);
    const around = await withDeleted(() => db.forOrg(organizationId, (tx) => tx.role.count()));
    expect(around).toBe(2);
  });

  it("restores a row inside withDeleted()", async () => {
    await db.forOrg(organizationId, (tx) =>
      withDeleted(() => tx.role.update({ where: { id: deletedRoleId }, data: { deletedAt: null, deletedBy: null } })),
    );
    expect(await db.forOrg(organizationId, (tx) => tx.role.count())).toBe(2);
  });

  it("applies to members, which the identity module reaches without forOrg()", async () => {
    const { client } = identityDatabase;
    const user = await client.user.create({
      data: { name: "Removed", email: `removed-${organizationId}@example.test` },
    });
    await client.member.create({ data: { userId: user.id, organizationId, role: "kept" } });
    await client.member.update({ where: { userId: user.id }, data: softDeleted(deletedBy) });
    expect(await client.member.findUnique({ where: { userId: user.id } })).toBeNull();
    await expect(client.member.deleteMany({ where: { userId: user.id } })).rejects.toBeInstanceOf(HardDeleteError);
    // Relations loaded with include are not filtered: query the soft-delete model itself.
    const withMember = await client.user.findUnique({ where: { id: user.id }, include: { member: true } });
    expect(withMember?.member?.deletedBy).toBe(deletedBy);
  });

  it("refuses upsert, which could update a deleted row and restore it outside withDeleted()", async () => {
    await expect(
      db.forOrg(organizationId, (tx) =>
        tx.role.upsert({
          where: { id: deletedRoleId },
          create: { key: "x", name: "X" },
          update: { deletedAt: null, deletedBy: null },
        }),
      ),
    ).rejects.toBeInstanceOf(SoftDeleteUpsertError);
  });

  it("gives the runtime role no DELETE grant on soft-delete tables, so raw SQL can't remove rows either", async () => {
    await expect(db.forOrg(organizationId, (tx) => tx.$executeRaw`DELETE FROM role`)).rejects.toThrow(
      /permission denied/i,
    );
    await expect(identityDatabase.client.$executeRaw`DELETE FROM member`).rejects.toThrow(/permission denied/i);
  });
});
