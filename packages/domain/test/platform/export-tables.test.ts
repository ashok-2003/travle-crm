// The export's tables, platform_export and platform_export_file, as the migration grants them: the console's platform
// role reads and writes them but never removes a row (an export is marked expired, a copy's row is never changed);
// the api and the worker, as the runtime role, can't reach them at all.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestPlatform, type TestPlatform } from "./test-platform.js";

describe("the export's tables", () => {
  let test: TestPlatform;
  let exportId: string;

  beforeAll(async () => {
    test = createTestPlatform();
    const now = new Date();
    exportId = (
      await test.services.platformDb.transaction((tx) =>
        tx.platformExport.create({
          data: {
            targetOrganizationId: randomUUID(),
            requestedBy: randomUUID(),
            requestedAt: now,
            expiresAt: new Date(now.getTime() + 60_000),
            files: { create: { attachmentId: randomUUID() } },
          },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await test.close();
  });

  const asPlatform = <T>(fn: Parameters<typeof test.services.platformDb.transaction<T>>[0]) =>
    test.services.platformDb.transaction(fn);

  it("let the platform role mark an export, but remove neither an export nor a copy's row", async () => {
    await expect(
      asPlatform((tx) => tx.platformExport.update({ where: { id: exportId }, data: { state: "failed" } })),
    ).resolves.toMatchObject({ state: "failed" });
    await expect(asPlatform((tx) => tx.platformExport.deleteMany({ where: { id: exportId } }))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      asPlatform((tx) =>
        tx.platformExportFile.updateMany({ where: { exportId }, data: { attachmentId: randomUUID() } }),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asPlatform((tx) => tx.platformExportFile.deleteMany({ where: { exportId } }))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("are out of reach of the api and the worker", async () => {
    const db = test.services.db;
    await expect(db.withoutOrg((tx) => tx.platformExport.count())).rejects.toThrow(/permission denied/);
    await expect(db.withoutOrg((tx) => tx.platformExportFile.count())).rejects.toThrow(/permission denied/);
    await expect(
      db.withoutOrg((tx) => tx.platformExportFile.create({ data: { exportId, attachmentId: randomUUID() } })),
    ).rejects.toThrow(/permission denied/);
  });

  it("keep an export's state and counts to what the job can mean", async () => {
    for (const data of [{ state: "lost" }, { state: "done" }, { partsWritten: -1 }, { clearedAt: new Date() }]) {
      await expect(
        asPlatform((tx) => tx.platformExport.update({ where: { id: exportId }, data })),
        JSON.stringify(data),
      ).rejects.toThrow(/check constraint/);
    }
  });
});
