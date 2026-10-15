// The platform log: what platform staff did, written in the platform's own transaction, kept after the organization
// it names is gone, and out of reach of the api and the worker.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { listPlatformLog, recordPlatformAudit } from "../../src/platform/index.js";

const adminUserId = "0199e7a0-0000-7000-8000-00000000a0a1";

describe("the platform log", () => {
  let platformDb: PlatformDatabase;
  let db: Database;

  beforeAll(() => {
    const urls = inject("dbUrls");
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 1 });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
  });

  it("records who did what to which organization, even one that no longer exists", async () => {
    const goneOrganizationId = randomUUID();
    await platformDb.transaction((tx) =>
      recordPlatformAudit(
        tx,
        { userId: adminUserId },
        {
          action: "organization.purged",
          targetType: "organization",
          targetId: goneOrganizationId,
          targetOrganizationId: goneOrganizationId,
          before: { code: "GONE01" },
        },
      ),
    );
    const page = await platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: goneOrganizationId, limit: 10 }),
    );
    expect(page).toEqual({
      entries: [
        expect.objectContaining({
          actorUserId: adminUserId,
          action: "organization.purged",
          targetType: "organization",
          targetId: goneOrganizationId,
          targetOrganizationId: goneOrganizationId,
          before: { code: "GONE01" },
          after: null,
        }),
      ],
      nextCursor: null,
    });
  });

  it("pages through the log newest first", async () => {
    const organizationId = randomUUID();
    // One transaction per entry, so each has its own time.
    for (const key of ["first", "second", "third"]) {
      await platformDb.transaction((tx) =>
        recordPlatformAudit(
          tx,
          { userId: null },
          { action: "demo.reset", targetType: "organization", targetId: key, targetOrganizationId: organizationId },
        ),
      );
    }
    const first = await platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 2 }),
    );
    expect(first.entries.map((entry) => entry.targetId)).toEqual(["third", "second"]);
    const rest = await platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, before: first.nextCursor ?? undefined, limit: 2 }),
    );
    expect(rest).toEqual({ entries: [expect.objectContaining({ targetId: "first" })], nextCursor: null });
  });

  it("refuses secrets, malformed actions and target kinds before writing anything", async () => {
    const write = (change: Parameters<typeof recordPlatformAudit>[2]) =>
      platformDb.transaction((tx) => recordPlatformAudit(tx, { userId: adminUserId }, change));
    await expect(
      write({ action: "staff.added", targetType: "platform_staff", targetId: adminUserId, after: { password: "x" } }),
    ).rejects.toThrow(/never hold secrets/);
    await expect(write({ action: "Staff added", targetType: "platform_staff", targetId: adminUserId })).rejects.toThrow(
      RangeError,
    );
    await expect(write({ action: "staff.added", targetType: "Platform staff", targetId: adminUserId })).rejects.toThrow(
      RangeError,
    );
    await expect(write({ action: "staff.added", targetType: "platform_staff", targetId: "" })).rejects.toThrow(
      RangeError,
    );
  });

  it("is append-only, even for the platform role", async () => {
    await expect(
      platformDb.transaction((tx) => tx.platformAuditEntry.updateMany({ data: { action: "nothing.happened" } })),
    ).rejects.toThrow(/permission denied/);
    await expect(platformDb.transaction((tx) => tx.platformAuditEntry.deleteMany({}))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("is out of reach of the api and the worker", async () => {
    await expect(db.withoutOrg((tx) => tx.platformAuditEntry.count())).rejects.toThrow(/permission denied/);
    await expect(
      db.withoutOrg((tx) =>
        tx.platformAuditEntry.create({ data: { action: "a.b", targetType: "organization", targetId: "x" } }),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
