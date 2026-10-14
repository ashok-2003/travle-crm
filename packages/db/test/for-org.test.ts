// db.forOrg() limits every query to one organization, and Postgres enforces it (spec section 4).
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { createDatabase, type Database } from "../src/database.js";
import { forOrg, InvalidOrganizationIdError, WrongDatabaseRoleError } from "../src/for-org.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("db.forOrg", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 3 });
    orgA = await createTestOrganization(platform, "Sharma Holidays");
    orgB = await createTestOrganization(platform, "Goa Escapes");
    await db.forOrg(orgA, (tx) => tx.orgCounter.create({ data: { key: "TEST-A", value: 1 } }));
    await db.forOrg(orgB, (tx) => tx.orgCounter.create({ data: { key: "TEST-B", value: 1 } }));
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("shows only the current organization's rows", async () => {
    const keys = await db.forOrg(orgA, async (tx) => (await tx.orgCounter.findMany()).map((row) => row.key));
    expect(keys).toContain("TEST-A");
    expect(keys).not.toContain("TEST-B");
  });

  it("fills organization_id from the transaction's organization", async () => {
    const row = await db.forOrg(orgA, (tx) => tx.orgCounter.create({ data: { key: "TEST-A2", value: 5 } }));
    expect(row.organizationId).toBe(orgA);
  });

  it("refuses to write a row for another organization", async () => {
    await expect(
      db.forOrg(orgA, (tx) => tx.orgCounter.create({ data: { organizationId: orgB, key: "SNEAKY", value: 1 } })),
    ).rejects.toThrow(/row-level security/);
  });

  it("refuses to move a row into another organization", async () => {
    await expect(
      db.forOrg(orgA, (tx) => tx.orgCounter.updateMany({ where: { key: "TEST-A" }, data: { organizationId: orgB } })),
    ).rejects.toThrow(/row-level security/);
  });

  it("sees nothing when no organization is set", async () => {
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      expect(await runtime.orgCounter.count()).toBe(0);
    } finally {
      await runtime.$disconnect();
    }
  });

  it("does not leak the organization to the next query on the same connection", async () => {
    // One connection, so the second query reuses the connection the transaction used.
    // Postgres reads the cleared setting back as '' (not NULL); NULLIF in the policy turns that into "no rows".
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      expect(await forOrg(runtime, orgA, (tx) => tx.orgCounter.count())).toBeGreaterThan(0);
      expect(await runtime.orgCounter.count()).toBe(0);
    } finally {
      await runtime.$disconnect();
    }
  });

  it("rejects an organization id that is not a UUID before touching the database", async () => {
    for (const badId of ["", "abc", "00000000-0000-0000-0000-00000000000z", "1; DROP TABLE organization"]) {
      await expect(db.forOrg(badId, (tx) => tx.orgCounter.count())).rejects.toBeInstanceOf(InvalidOrganizationIdError);
    }
  });

  it("lets the platform client see every organization's rows", async () => {
    const rows = await platform.orgCounter.findMany({ where: { organizationId: { in: [orgA, orgB] } } });
    expect(new Set(rows.map((row) => row.organizationId))).toEqual(new Set([orgA, orgB]));
  });

  it("refuses to run as a role that can see every organization", async () => {
    // A wrong DATABASE_URL would otherwise switch isolation off without any error.
    for (const url of [urls.migrator, urls.platform]) {
      const wrongRole = createDatabase(url, { maxConnections: 1 });
      try {
        await expect(wrongRole.forOrg(orgA, (tx) => tx.orgCounter.count())).rejects.toBeInstanceOf(
          WrongDatabaseRoleError,
        );
      } finally {
        await wrongRole.disconnect();
      }
    }
  });
});
