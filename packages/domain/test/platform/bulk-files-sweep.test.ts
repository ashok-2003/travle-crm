// The console's hourly sweep of import and export files (B53, B54, M1, M11): more than a page of each is swept in one
// run, every import and export in its own transaction, their files deleted from storage; one that fails is left for
// the next run without holding back the rest, and the run then fails counting it; one a job holds (SKIP LOCKED) waits
// for the next hour. It runs on a database of its own: the other sweeps' tests take every import due in theirs.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobAdministration, createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { createMemoryStorage, type MemoryStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  BulkFilesSweepFailedError,
  createPlatformServices,
  type PlatformServices,
  sweepBulkFiles,
} from "../../src/platform/index.js";
import { createTestIdentity, type TestIdentity } from "../identity/test-identity.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const startedBy = "0199e7a0-0000-7000-8000-0000000000f1";

describe("the hourly sweep of import and export files", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let storage: MemoryStorage;
  let identity: TestIdentity;
  let services: PlatformServices;

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 2 });
    storage = createMemoryStorage();
    // Sign-in is no part of the sweep: the shared test identity stands in.
    identity = createTestIdentity();
    services = createPlatformServices({
      platformDatabaseUrl: isolated.urls.platform,
      maxConnections: 2,
      db,
      identity: identity.identity,
      storage,
      queue: createMemoryJobQueue(),
      jobs: createMemoryJobAdministration(),
      log: () => undefined,
    });
  }, 120_000);

  afterAll(async () => {
    await services.platformDb.disconnect();
    await db.disconnect();
    await platform.$disconnect();
    await identity.close();
    await isolated.drop();
  });

  /** A ready file under the record, in storage where the files module keeps it. */
  async function storedFile(organizationId: string, recordType: string, recordId: string) {
    const file = await db.forOrg(organizationId, (tx) =>
      tx.attachment.create({
        data: {
          recordType,
          recordId,
          fileName: "leads.csv",
          contentType: "text/csv",
          sizeBytes: 3,
          status: "ready",
          confirmedAt: new Date(),
        },
      }),
    );
    await storage.put({
      key: `organizations/${organizationId}/attachments/${file.id}`,
      contentType: "text/csv",
      body: new Uint8Array([1, 2, 3]),
    });
  }

  /** `count` imports and as many exports of a new agency, all past their time; the first of each with a file. */
  async function dueWork(count: number) {
    const organizationId = await createTestOrganization(platform, "Sweep agency");
    const past = new Date(Date.now() - DAY_MS);
    const imports = await Promise.all(
      Array.from({ length: count }, () =>
        platform.importBatch.create({
          data: { organizationId, kind: "leads", fileName: "a.csv", fileKind: "csv", startedBy, keepUntil: past },
          select: { id: true },
        }),
      ),
    );
    const exports = await Promise.all(
      Array.from({ length: count }, () =>
        platform.dataExport.create({
          data: {
            organizationId,
            kind: "leads",
            format: "csv",
            status: "ready",
            filter: {},
            requestedBy: startedBy,
            readyAt: new Date(past.getTime() - DAY_MS),
            expiresAt: past,
          },
          select: { id: true },
        }),
      ),
    );
    await storedFile(organizationId, "import_batch", imports[0]?.id ?? "");
    await storedFile(organizationId, "data_export", exports[0]?.id ?? "");
    return { organizationId, imports: imports.map((row) => row.id), exports: exports.map((row) => row.id) };
  }

  const statusesOf = async (work: { imports: string[]; exports: string[] }) => ({
    imports: await platform.importBatch.count({ where: { id: { in: work.imports }, status: "expired" } }),
    exports: await platform.dataExport.count({ where: { id: { in: work.exports }, status: "expired" } }),
  });

  /** The test's services, counting the platform transactions and failing the given ones (1-based). */
  function countingServices(failing: ReadonlySet<number> = new Set()) {
    const counted = { transactions: 0 };
    const platformDb = services.platformDb;
    const counting: PlatformServices = {
      ...services,
      platformDb: {
        ...platformDb,
        transaction: (work, options) => {
          counted.transactions += 1;
          if (failing.has(counted.transactions)) return Promise.reject(new Error("A slow import"));
          return platformDb.transaction(work, options);
        },
      },
    };
    return { services: counting, counted };
  }

  it("sweeps more than a page of imports and exports, each in its own transaction, and deletes their files", async () => {
    const work = await dueWork(101);
    const counting = countingServices();
    expect(await sweepBulkFiles(counting.services, new Date())).toBe(202);
    expect(await statusesOf(work)).toEqual({ imports: 101, exports: 101 });
    // Every item its own, beside the pages that list them.
    expect(counting.counted.transactions).toBeGreaterThanOrEqual(202);
    expect([...storage.objects.keys()].filter((key) => key.includes(work.organizationId))).toEqual([]);
  });

  it("leaves one that fails for the next run, sweeping the rest, and fails the run counting it", async () => {
    const work = await dueWork(3);
    // The first page's listing is transaction 1; the second import's own is transaction 3.
    const failing = countingServices(new Set([3]));
    await expect(sweepBulkFiles(failing.services, new Date())).rejects.toBeInstanceOf(BulkFilesSweepFailedError);
    expect(await statusesOf(work)).toEqual({ imports: 2, exports: 3 });
    await sweepBulkFiles(services, new Date());
    expect(await statusesOf(work)).toEqual({ imports: 3, exports: 3 });
  });

  it("skips an import and an export a job holds, and sweeps them once they're free", async () => {
    const work = await dueWork(2);
    const [heldImport, heldExport] = [work.imports[0] ?? "", work.exports[0] ?? ""];
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding = services.platformDb.transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM import_batch WHERE id = ${heldImport}::uuid FOR NO KEY UPDATE`;
        await tx.$queryRaw`SELECT id FROM data_export WHERE id = ${heldExport}::uuid FOR NO KEY UPDATE`;
        await released;
      },
      { timeout: 30_000 },
    );
    try {
      await sweepBulkFiles(services, new Date());
      expect(await statusesOf(work)).toEqual({ imports: 1, exports: 1 });
    } finally {
      release();
      await holding;
    }
    await sweepBulkFiles(services, new Date());
    expect(await statusesOf(work)).toEqual({ imports: 2, exports: 2 });
  });
});
