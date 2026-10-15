// A platform transaction steps into one organization at a time, and nothing else uses it meanwhile: two steps, or a
// step and a platform query, would interleave their role switches on the transaction's one connection. And a
// transaction that Postgres aborted never looks committed: once a step failed in the database, every later use and
// the commit throw.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { createDatabase, type Database } from "../src/database.js";
import { NestedForOrgError, OrganizationStepOpenError, PlatformTransactionAbortedError } from "../src/errors.js";
import type { IdentityTx } from "../src/for-org.js";
import {
  asOrganization,
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
  type PlatformTx,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const SEEN = "STEPS-SEEN";

/** The organizations whose rows a step sees, after round trips that give work beside it room to interleave. */
async function organizationsSeen(orgTx: IdentityTx): Promise<string[]> {
  await orgTx.$queryRaw`SELECT 1`;
  await orgTx.$queryRaw`SELECT 1`;
  const rows = await orgTx.orgCounter.findMany({ where: { key: SEEN }, select: { organizationId: true } });
  return rows.map((row) => row.organizationId).sort();
}

/** What a settled promise was rejected with, or "fulfilled". */
function rejectionOf(result: PromiseSettledResult<unknown> | undefined): unknown {
  return result?.status === "rejected" ? result.reason : "fulfilled";
}

/** A write the runtime role has no right to: a database error inside a step, which aborts the transaction. */
const forbiddenWrite = (orgTx: IdentityTx) => orgTx.$executeRaw`UPDATE audit_entry SET before = NULL`;

describe("steps into an organization", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let db: Database;
  let organizationA: string;
  let organizationB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    db = createDatabase(urls.runtime, { maxConnections: 1 });
    organizationA = await createTestOrganization(platform, "Steps A");
    organizationB = await createTestOrganization(platform, "Steps B");
    await platform.orgCounter.createMany({
      data: [organizationA, organizationB].map((organizationId) => ({ organizationId, key: SEEN, value: 1 })),
    });
  });

  afterAll(async () => {
    await db.disconnect();
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("refuses a second step beside the first before it runs any SQL, so neither sees the other's organization", async () => {
    const second = vi.fn(organizationsSeen);
    const { settled, after } = await platformDb.transaction(async (tx) => ({
      settled: await Promise.allSettled([
        asOrganization(tx, organizationA, organizationsSeen),
        asOrganization(tx, organizationB, second),
      ]),
      after: await tx.$queryRaw`SELECT current_user AS role, current_setting('app.org_id', true) AS organization`,
    }));
    const [first, refused] = settled;
    expect(first).toEqual({ status: "fulfilled", value: [organizationA] });
    expect(rejectionOf(refused)).toBeInstanceOf(NestedForOrgError);
    expect(second).not.toHaveBeenCalled();
    expect(after).toEqual([{ role: "app_platform", organization: "" }]);
  });

  it("refuses the platform transaction's own queries while a step is open, so none runs in the organization", async () => {
    const [step, beside] = await platformDb.transaction((tx) =>
      Promise.allSettled([
        asOrganization(tx, organizationA, organizationsSeen),
        (async () => tx.orgCounter.count({ where: { key: SEEN } }))(),
      ]),
    );
    expect(step).toEqual({ status: "fulfilled", value: [organizationA] });
    expect(rejectionOf(beside)).toBeInstanceOf(OrganizationStepOpenError);
  });

  it("refuses to commit while a step it didn't wait for is still open", async () => {
    let step: Promise<unknown> | undefined;
    await expect(
      platformDb.transaction(async (tx) => {
        step = asOrganization(tx, organizationA, organizationsSeen);
        return Promise.resolve("returned without waiting");
      }),
    ).rejects.toBeInstanceOf(OrganizationStepOpenError);
    // The step itself fails once its transaction is rolled back.
    await expect(step).rejects.toThrow();
  });

  it("ends a transaction whose step failed in the database: nothing more runs, it can't commit, nothing is saved", async () => {
    const key = `STEPS-${randomUUID()}`;
    const seen: Record<string, unknown> = {};
    const outcome = platformDb.transaction(async (tx) => {
      await tx.orgCounter.create({ data: { organizationId: organizationB, key, value: 1 } });
      seen.step = await asOrganization(tx, organizationA, forbiddenWrite).catch((error: unknown) => error);
      seen.query = await (async () => tx.orgCounter.count())().catch((error: unknown) => error);
      seen.nextStep = await asOrganization(tx, organizationB, organizationsSeen).catch((error: unknown) => error);
      return "returned as if nothing happened";
    });
    await expect(outcome).rejects.toBeInstanceOf(PlatformTransactionAbortedError);
    // The step's own error reaches its caller; everything after is refused with ours, before any SQL.
    expect(String(seen.step)).toMatch(/permission denied/);
    expect(seen.query).toBeInstanceOf(PlatformTransactionAbortedError);
    expect(seen.nextStep).toBeInstanceOf(PlatformTransactionAbortedError);
    expect(await platform.orgCounter.count({ where: { key } })).toBe(0);
  });

  it("ends a transaction whose step swallowed its own database error", async () => {
    const outcome = platformDb.transaction(async (tx) => {
      const left = await asOrganization(tx, organizationA, async (orgTx) => {
        await forbiddenWrite(orgTx).catch(() => undefined);
        return "swallowed";
      }).catch((error: unknown) => error);
      return left;
    });
    await expect(outcome).rejects.toBeInstanceOf(PlatformTransactionAbortedError);
  });

  it("can't commit after a database error outside any step either, even one its caller caught", async () => {
    const key = `STEPS-${randomUUID()}`;
    const outcome = platformDb.transaction(async (tx) => {
      await tx.orgCounter.create({ data: { organizationId: organizationA, key, value: 1 } });
      await tx.orgCounter.create({ data: { organizationId: organizationA, key, value: 2 } }).catch(() => undefined);
      return "returned as if nothing happened";
    });
    await expect(outcome).rejects.toThrow(/current transaction is aborted/);
    expect(await platform.orgCounter.count({ where: { key } })).toBe(0);
  });

  it("steps only out of a platform transaction, never out of another organization's", async () => {
    const inside = vi.fn(organizationsSeen);
    await expect(
      db.forOrg(organizationA, (tx) => asOrganization(tx as unknown as PlatformTx, organizationB, inside)),
    ).rejects.toBeInstanceOf(TypeError);
    expect(inside).not.toHaveBeenCalled();
  });
});
