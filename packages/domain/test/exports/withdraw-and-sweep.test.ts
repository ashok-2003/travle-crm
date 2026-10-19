// Keeping and deleting an export's file (spec B54, B55, D31, D32): 24 hours after it was ready the console's sweep
// deletes it for good; a file stored late under an expired export goes too, and so does one under an export whose job
// never finished; an erasure withdraws every export file of the organization at once. The search is never kept.
import { createPlatformDatabase, type PlatformDatabase } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { exportsToSweep, sweepExport, withdrawExportFiles } from "../../src/exports/index.js";
import { systemActor } from "../../src/kernel/index.js";
import { anAgency, bytes, createTestImports, memberOf, type TestImports } from "../imports/support/test-imports.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("keeping and deleting an export's file", () => {
  let test: TestImports;
  let platformDb: PlatformDatabase;

  beforeAll(() => {
    test = createTestImports();
    platformDb = createPlatformDatabase(inject("dbUrls").platform, { maxConnections: 2 });
  });

  afterAll(async () => {
    await platformDb.disconnect();
    await test.close();
  });

  /** An export at `status` with its file stored, ready (or asked for) at `at`. */
  async function anExport(organizationId: string, status: string, at: Date) {
    const row = await test.db.forOrg(organizationId, (tx) =>
      tx.dataExport.create({
        data: {
          kind: "leads",
          format: "csv",
          status,
          filter: { view: "everyone", search: "Sharma" },
          requestedBy: memberOf(organizationId).userId,
          createdAt: at,
          ...(status === "ready" ? { readyAt: at, expiresAt: new Date(at.getTime() + DAY_MS) } : {}),
        },
      }),
    );
    const file = await test.files.storeGeneratedFile(systemActor(organizationId), {
      recordType: "data_export",
      recordId: row.id,
      attachmentId: row.id,
      fileName: "leads.csv",
      contentType: "text/csv",
      body: bytes("Name"),
    });
    if (status === "ready") {
      await test.db.forOrg(organizationId, (tx) =>
        tx.dataExport.update({ where: { id: row.id }, data: { fileAttachmentId: file.id } }),
      );
    }
    return row.id;
  }

  /** The sweep as the console runs it: a page of exports to visit, each swept in its own transaction. */
  async function sweep(now: Date) {
    const items = await platformDb.transaction((tx) => exportsToSweep(tx, now, 100, []));
    for (const item of items) await platformDb.transaction((tx) => sweepExport(tx, item, now));
    return items;
  }
  const exportOf = (id: string) => test.platform.dataExport.findUniqueOrThrow({ where: { id } });
  const filesOf = (id: string) => test.platform.attachment.count({ where: { recordId: id } });

  it("sweeps an export 24 hours after it was ready", async () => {
    const organizationId = await anAgency(test, "Swept exports");
    const now = new Date();
    const old = await anExport(organizationId, "ready", new Date(now.getTime() - DAY_MS - 1000));
    const fresh = await anExport(organizationId, "ready", new Date(now.getTime() - 1000));
    const swept = await sweep(now);
    expect(swept.map((item) => item.organizationId)).toContain(organizationId);
    expect(await filesOf(old)).toBe(0);
    expect(await exportOf(old)).toMatchObject({
      status: "expired",
      fileAttachmentId: null,
      filter: { view: "everyone", search: null },
    });
    expect(await test.platform.storedFileDeletion.count({ where: { attachmentId: old } })).toBe(1);
    expect(await filesOf(fresh)).toBe(1);
    expect(await exportOf(fresh)).toMatchObject({ status: "ready" });
  });

  it("deletes a file stored late under an export already expired, or one whose job never finished", async () => {
    const organizationId = await anAgency(test, "Late export");
    const now = new Date();
    const late = await anExport(organizationId, "expired", now);
    const stuck = await anExport(organizationId, "making", new Date(now.getTime() - DAY_MS - 1000));
    const making = await anExport(organizationId, "making", now);
    await sweep(now);
    expect(await filesOf(late)).toBe(0);
    expect(await filesOf(stuck)).toBe(0);
    expect(await exportOf(stuck)).toMatchObject({ status: "expired", filter: { view: "everyone", search: null } });
    // Still being made: left to its job.
    expect(await filesOf(making)).toBe(1);
    expect(await exportOf(making)).toMatchObject({ status: "making" });
  });

  it("withdraws every export file of the organization in an erasure", async () => {
    const organizationId = await anAgency(test, "Erasure exports");
    const now = new Date();
    const ready = await anExport(organizationId, "ready", now);
    const making = await anExport(organizationId, "making", now);
    const failed = await anExport(organizationId, "failed", now);
    const elsewhere = await anExport(await anAgency(test, "Kept exports"), "ready", now);
    expect(await platformDb.transaction((tx) => withdrawExportFiles(tx, organizationId, now))).toEqual({
      exports: 2,
      files: 3,
    });
    for (const id of [ready, making, failed]) expect(await filesOf(id)).toBe(0);
    expect((await exportOf(ready)).status).toBe("expired");
    expect((await exportOf(making)).status).toBe("expired");
    expect((await exportOf(failed)).status).toBe("failed");
    expect(await filesOf(elsewhere)).toBe(1);
  });
});
