// An export is its requester's (spec B42, D6): asked for with its format and the list's filter as sent, followed on its
// page, and downloaded through a 5-minute link for 24 hours, each download in the audit log.
import type { OrgTx } from "@travel-crm/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { exportDetail, exportDownloadLink, runExport, startExport } from "../../src/exports/index.js";
import {
  anAgency,
  auditOf,
  createTestImports,
  eventsOf,
  listenerContext,
  memberOf,
  type TestImports,
} from "../imports/support/test-imports.js";
import { exportDependencies, requested, testSource } from "./test-exports.js";

describe("an export's request and download", () => {
  let test: TestImports;
  let organizationId: string;
  let requester: MemberAccess;
  const inOrg = <T>(work: (tx: OrgTx) => Promise<T>) => test.db.forOrg(organizationId, work);
  const filter = { stage: "contacted", ownerUserId: null, search: "Sharma" };

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    requester = memberOf(organizationId, "sales");
  });

  afterAll(async () => {
    await test.close();
  });

  it("makes an export for its requester only: another person's is NOT_FOUND", async () => {
    const { exportId } = await inOrg((tx) =>
      startExport(tx, requester, "leads", { format: "xlsx", filter }, new Date()),
    );
    expect(await eventsOf(test, organizationId, ["export.requested"])).toContainEqual([
      "export.requested",
      { exportId, kind: "leads" },
    ]);
    expect(await inOrg((tx) => exportDetail(tx, requester, "leads", exportId))).toMatchObject({
      id: exportId,
      kind: "leads",
      format: "xlsx",
      status: "making",
      failureReason: null,
      file: null,
      readyAt: null,
      filter,
    });
    const notFound = { code: "NOT_FOUND" };
    await expect(inOrg((tx) => exportDetail(tx, memberOf(organizationId), "leads", exportId))).rejects.toMatchObject(
      notFound,
    );
    await expect(inOrg((tx) => exportDetail(tx, requester, "staff", exportId))).rejects.toMatchObject(notFound);
    const elsewhere = memberOf(await anAgency(test, "Elsewhere"), "sales", { userId: requester.userId });
    await expect(
      test.db.forOrg(elsewhere.organizationId, (tx) => exportDetail(tx, elsewhere, "leads", exportId)),
    ).rejects.toMatchObject(notFound);
  });

  it("downloads through a 5-minute link for 24 hours, recording export.downloaded; EXPORT_NOT_READY before, EXPORT_EXPIRED after", async () => {
    const { exportId } = await inOrg((tx) =>
      startExport(tx, requester, "leads", { format: "csv", filter }, new Date()),
    );
    const download = (now: Date) => exportDownloadLink(test.db, test.files, requester, "leads", exportId, now);
    await expect(download(new Date())).rejects.toMatchObject({ code: "CONFLICT", reason: "EXPORT_NOT_READY" });
    await runExport(
      requested(organizationId, exportId),
      listenerContext(test, organizationId),
      exportDependencies(test, requester),
      testSource(),
    );
    const detail = await inOrg((tx) => exportDetail(tx, requester, "leads", exportId));
    expect(detail.file).toMatchObject({
      fileName: expect.stringMatching(/^leads-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/) as unknown,
    });
    const readyAt = new Date(detail.readyAt ?? 0);
    const link = await download(new Date(readyAt.getTime() + 23 * 60 * 60 * 1000));
    const seconds = (link.expiresAt.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(280);
    expect(seconds).toBeLessThanOrEqual(300);
    const audit = await auditOf(test, organizationId, exportId);
    expect(
      audit.filter((entry) => entry.action === "export.downloaded").map((entry) => [entry.actorUserId, entry.after]),
    ).toEqual([[requester.userId, { kind: "leads", format: "csv" }]]);
    await expect(download(new Date(readyAt.getTime() + 24 * 60 * 60 * 1000 + 1))).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "EXPORT_EXPIRED",
    });
    await inOrg((tx) =>
      tx.dataExport.update({ where: { id: exportId }, data: { status: "expired", fileAttachmentId: null } }),
    );
    await expect(download(readyAt)).rejects.toMatchObject({ reason: "EXPORT_EXPIRED" });
    await expect(
      exportDownloadLink(test.db, test.files, memberOf(organizationId), "leads", exportId, readyAt),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
