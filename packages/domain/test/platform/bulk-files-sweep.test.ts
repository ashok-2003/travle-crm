// The console's hourly sweep of import and export files (B53, B54, M1, M11): more than a page of each is swept in one
// run, every import and export in its own transaction, their files deleted from storage; one that fails is left for
// the next run without holding back the rest, and the run then fails counting it; one a job holds (SKIP LOCKED) waits
// for the next hour.
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { BulkFilesSweepFailedError, type PlatformServices, sweepBulkFiles } from "../../src/platform/index.js";
import { storedFile } from "./test-deletion.js";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const startedBy = "0199e7a0-0000-7000-8000-0000000000f1";

describe("the hourly sweep of import and export files", () => {
  let test: TestPlatform;
  let platform: PlatformClient;

  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });

  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

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
    const importFile = await storedFile(test, organizationId, "a.csv", imports[0]?.id);
    const exportFile = await storedFile(test, organizationId, "leads.csv", exports[0]?.id);
    await platform.attachment.updateMany({ where: { id: importFile }, data: { recordType: "import_batch" } });
    await platform.attachment.updateMany({ where: { id: exportFile }, data: { recordType: "data_export" } });
    return { organizationId, imports: imports.map((row) => row.id), exports: exports.map((row) => row.id) };
  }

  const statusesOf = async (work: { imports: string[]; exports: string[] }) => ({
    imports: await platform.importBatch.count({ where: { id: { in: work.imports }, status: "expired" } }),
    exports: await platform.dataExport.count({ where: { id: { in: work.exports }, status: "expired" } }),
  });

  /** The test's services, counting the platform transactions and failing the given ones (1-based). */
  function countingServices(failing: ReadonlySet<number> = new Set()) {
    const counted = { transactions: 0 };
    const platformDb = test.services.platformDb;
    const services: PlatformServices = {
      ...test.services,
      platformDb: {
        ...platformDb,
        transaction: (work, options) => {
          counted.transactions += 1;
          if (failing.has(counted.transactions)) return Promise.reject(new Error("A slow import"));
          return platformDb.transaction(work, options);
        },
      },
    };
    return { services, counted };
  }

  it("sweeps more than a page of imports and exports, each in its own transaction, and deletes their files", async () => {
    const work = await dueWork(101);
    const { services, counted } = countingServices();
    expect(await sweepBulkFiles(services, new Date())).toBeGreaterThanOrEqual(202);
    expect(await statusesOf(work)).toEqual({ imports: 101, exports: 101 });
    // Every item its own, beside the pages that list them.
    expect(counted.transactions).toBeGreaterThanOrEqual(202);
    expect([...test.storage.objects.keys()].filter((key) => key.includes(work.organizationId))).toEqual([]);
  });

  it("leaves one that fails for the next run, sweeping the rest, and fails the run counting it", async () => {
    const work = await dueWork(3);
    // The first page's listing is transaction 1; the second import's own is transaction 3.
    const { services } = countingServices(new Set([3]));
    await expect(sweepBulkFiles(services, new Date())).rejects.toBeInstanceOf(BulkFilesSweepFailedError);
    expect(await statusesOf(work)).toEqual({ imports: 2, exports: 3 });
    await sweepBulkFiles(test.services, new Date());
    expect(await statusesOf(work)).toEqual({ imports: 3, exports: 3 });
  });

  it("skips an import and an export a job holds, and sweeps them once they're free", async () => {
    const work = await dueWork(2);
    const [heldImport, heldExport] = [work.imports[0] ?? "", work.exports[0] ?? ""];
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holding = test.services.platformDb.transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM import_batch WHERE id = ${heldImport}::uuid FOR NO KEY UPDATE`;
        await tx.$queryRaw`SELECT id FROM data_export WHERE id = ${heldExport}::uuid FOR NO KEY UPDATE`;
        await released;
      },
      { timeout: 30_000 },
    );
    try {
      await sweepBulkFiles(test.services, new Date());
      expect(await statusesOf(work)).toEqual({ imports: 1, exports: 1 });
    } finally {
      release();
      await holding;
    }
    await sweepBulkFiles(test.services, new Date());
    expect(await statusesOf(work)).toEqual({ imports: 2, exports: 2 });
  });
});
