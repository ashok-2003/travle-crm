// Readable numbers like BK-2026-0042: per organization, per prefix, per year, never repeated (spec section 4).
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { createPrismaClient } from "../src/client.js";
import { nextDocumentNumber } from "../src/counters.js";
import { createDatabase, type Database } from "../src/database.js";
import { createPlatformClient, type PlatformClient } from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

describe("nextDocumentNumber", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let db: Database;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    db = createDatabase(urls.runtime);
    orgA = await createTestOrganization(platform);
    orgB = await createTestOrganization(platform);
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
  });

  it("counts up from 0001", async () => {
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      numbers.push(await db.forOrg(orgA, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 })));
    }
    expect(numbers).toEqual(["BK-2026-0001", "BK-2026-0002", "BK-2026-0003"]);
  });

  it("keeps separate counters per prefix, per year and per organization", async () => {
    expect(await db.forOrg(orgA, (tx) => nextDocumentNumber(tx, { prefix: "QT", year: 2026 }))).toBe("QT-2026-0001");
    expect(await db.forOrg(orgA, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2027 }))).toBe("BK-2027-0001");
    expect(await db.forOrg(orgB, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }))).toBe("BK-2026-0001");
  });

  it("never hands out the same number twice when called concurrently", async () => {
    const orgC = await createTestOrganization(platform);
    const numbers = await Promise.all(
      Array.from({ length: 25 }, () => db.forOrg(orgC, (tx) => nextDocumentNumber(tx, { prefix: "RC", year: 2026 }))),
    );
    const expected = Array.from({ length: 25 }, (_, i) => `RC-2026-${String(i + 1).padStart(4, "0")}`);
    expect([...numbers].sort()).toEqual(expected);
  });

  it("keeps counting past 9999 without cutting digits", async () => {
    const orgD = await createTestOrganization(platform);
    await platform.orgCounter.create({ data: { organizationId: orgD, key: "BK-2026", value: 9999 } });
    expect(await db.forOrg(orgD, (tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }))).toBe("BK-2026-10000");
  });

  it("rejects malformed prefixes and years", async () => {
    const bad = [
      { prefix: "bk", year: 2026 },
      { prefix: "B", year: 2026 },
      { prefix: "BOOKING", year: 2026 },
      { prefix: "BK", year: 1999 },
      { prefix: "BK", year: 2026.5 },
    ];
    for (const options of bad) {
      await expect(db.forOrg(orgA, (tx) => nextDocumentNumber(tx, options))).rejects.toBeInstanceOf(RangeError);
    }
  });

  it("fails outside an organization transaction instead of numbering for nobody", async () => {
    const runtime = createPrismaClient(urls.runtime, { max: 1 });
    try {
      await expect(runtime.$transaction((tx) => nextDocumentNumber(tx, { prefix: "BK", year: 2026 }))).rejects.toThrow(
        // Postgres checks the RLS policy (organization_id = NULL is never true) before the NOT NULL constraint.
        /row-level security|null value/,
      );
    } finally {
      await runtime.$disconnect();
    }
  });
});
