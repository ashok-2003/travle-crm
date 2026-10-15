// Queries that run later than they were made. Prisma's queries are lazy, starting only when awaited, so a guard that
// looked only at when a query was made would miss these: work begun in a step and awaited after it (it would run as
// the platform role, seeing every organization), a platform query made before a step and awaited during it (it would
// run in the organization), and a step left behind by a refused query beside it (its rejection would go unhandled
// and end the console process).
import { inspect } from "node:util";
import { afterAll, beforeAll, describe, expect, inject, it, vi } from "vitest";
import { OrganizationStepEndedError, OrganizationStepOpenError } from "../src/errors.js";
import type { IdentityTx } from "../src/for-org.js";
import {
  asOrganization,
  createPlatformClient,
  createPlatformDatabase,
  type PlatformClient,
  type PlatformDatabase,
} from "../src/platform.js";
import { createTestOrganization } from "./helpers.js";

const SEEN = "LATE-SEEN";

/** The organizations whose rows a step sees, after a round trip first. */
async function organizationsSeen(orgTx: IdentityTx): Promise<string[]> {
  await orgTx.$queryRaw`SELECT 1`;
  const rows = await orgTx.orgCounter.findMany({ where: { key: SEEN }, select: { organizationId: true } });
  return rows.map((row) => row.organizationId).sort();
}

/** What a promise is fulfilled with, or the error it is rejected with. It starts a lazy query. */
function outcomeOf(promise: PromiseLike<unknown>): Promise<unknown> {
  return Promise.resolve(promise).then(
    (value) => value,
    (error: unknown) => error,
  );
}

describe("queries that run later than they were made", () => {
  const urls = inject("dbUrls");
  let platform: PlatformClient;
  let platformDb: PlatformDatabase;
  let organizationA: string;
  let organizationB: string;

  beforeAll(async () => {
    platform = createPlatformClient(urls.platform);
    platformDb = createPlatformDatabase(urls.platform, { maxConnections: 2 });
    organizationA = await createTestOrganization(platform, "Late A");
    organizationB = await createTestOrganization(platform, "Late B");
    await platform.orgCounter.createMany({
      data: [organizationA, organizationB].map((organizationId) => ({ organizationId, key: SEEN, value: 1 })),
    });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await platform.$disconnect();
  });

  it("refuses a step's transaction once the step has ended, so nothing begun in it runs as the platform role", async () => {
    const { late, after } = await platformDb.transaction(async (tx) => {
      const begun: PromiseLike<unknown>[] = [];
      await asOrganization(tx, organizationA, (orgTx) => {
        // A query made in the step but awaited after it, so it starts only then.
        begun.push(orgTx.orgCounter.findMany({ where: { key: SEEN }, select: { organizationId: true } }));
        // A helper begun in the step, whose later queries come after it.
        begun.push(outcomeOf(organizationsSeen(orgTx)));
        return Promise.resolve();
      });
      return {
        late: await Promise.all(begun.map(outcomeOf)),
        after: await tx.orgCounter.count({ where: { key: SEEN } }),
      };
    });
    expect(late[0]).toBeInstanceOf(OrganizationStepEndedError);
    expect(late[1]).toBeInstanceOf(OrganizationStepEndedError);
    // Refused before any SQL ran, so the transaction went on as the platform role.
    expect(after).toBe(2);
  });

  it("refuses a platform query made before a step but run while it is open, so none runs in the organization", async () => {
    const [before, step] = await platformDb.transaction((tx) =>
      Promise.all([
        outcomeOf(tx.orgCounter.count({ where: { key: SEEN } })),
        outcomeOf(asOrganization(tx, organizationA, organizationsSeen)),
      ]),
    );
    expect(before).toBeInstanceOf(OrganizationStepOpenError);
    expect(step).toEqual([organizationA]);
  });

  it("leaves no rejection unhandled when a refused query beside a step leaves the step behind", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      let step: Promise<unknown> | undefined;
      await expect(
        platformDb.transaction((tx) =>
          // The query beside the step throws as the array is built, so Promise.all never takes the step.
          Promise.all([(step = asOrganization(tx, organizationA, organizationsSeen)), tx.orgCounter.count()]),
        ),
      ).rejects.toBeInstanceOf(OrganizationStepOpenError);
      // The step fails once its transaction is rolled back. Wait for that without handling it here: inspect() reads
      // a promise's state without adding a handler.
      await vi.waitFor(() => {
        expect(inspect(step)).toMatch(/<rejected>/);
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
