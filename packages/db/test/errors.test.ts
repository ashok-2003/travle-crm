// isUniqueViolation lets other packages turn a taken email or key into a friendly error without importing Prisma.
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { isUniqueViolation } from "../src/errors.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("isUniqueViolation", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime, { maxConnections: 2 });
    organizationId = await createTestOrganization(platform, "Unique violations");
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("recognises a taken unique value, and nothing else", async () => {
    await db.forOrg(organizationId, (tx) => tx.role.create({ data: { key: "twice", name: "Twice" } }));
    const duplicate = await db
      .forOrg(organizationId, (tx) => tx.role.create({ data: { key: "twice", name: "Twice" } }))
      .catch((error: unknown) => error);
    expect(isUniqueViolation(duplicate)).toBe(true);
    const badKey = await db
      .forOrg(organizationId, (tx) => tx.role.create({ data: { key: "Not Valid", name: "Bad" } }))
      .catch((error: unknown) => error);
    expect(isUniqueViolation(badKey)).toBe(false);
    expect(isUniqueViolation(new Error("P2002"))).toBe(false);
  });
});
