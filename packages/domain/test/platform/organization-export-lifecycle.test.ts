// An export's life after its job: links that last 15 minutes, each download in the platform log; a failed attempt
// marked and finished by a retry; a repeated job that does nothing; an export that counts for its own organization
// only. Also the database function it reads with, which only reads an organization's own tables. Its end is
// organization-export-expiry.test.ts's.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { asOrganization, type PlatformDatabase } from "@travel-crm/db/platform";
import { sanitizeJobError } from "@travel-crm/integrations/jobs";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  downloadOrganizationExport,
  exportSubject,
  listOrganizationExports,
  listPlatformLog,
  onboardOrganization,
  requestOrganizationExport,
  runOrganizationExport,
} from "../../src/platform/index.js";
import { exportedRecently } from "../../src/platform/exports.js";
import { exportOrganizationNow } from "./test-exports.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("an export's life", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  async function agency(): Promise<string> {
    return (await onboardOrganization(test.services, support, onboardingInput(plan))).organizationId;
  }

  async function logOf(organizationId: string) {
    return (
      await test.services.platformDb.transaction((tx) =>
        listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 20 }),
      )
    ).entries;
  }

  it("gives 15-minute links to a done export, and logs each download by ids and counts", async () => {
    const organizationId = await agency();
    const requested = await requestOrganizationExport(test.services, support, organizationId);
    await expect(downloadOrganizationExport(test.services, support, requested.exportId)).rejects.toMatchObject({
      reason: "EXPORT_NOT_READY",
    });
    await runOrganizationExport(test.services, { exportId: requested.exportId });
    const now = new Date();
    const download = await downloadOrganizationExport(test.services, support, requested.exportId, now);
    expect(download.linksExpireAt).toBe(new Date(now.getTime() + 15 * 60 * 1000).toISOString());
    expect(download.parts).toEqual([{ part: 1, url: expect.stringContaining(requested.exportId) as string }]);
    expect(download.files).toEqual([]);
    const [entry] = await logOf(organizationId);
    expect(entry).toMatchObject({
      action: "organization.export-downloaded",
      actorUserId: support.userId,
      after: { exportId: requested.exportId, parts: 1, files: 0 },
    });
    await expect(
      downloadOrganizationExport(test.services, support, "0199e7a0-0000-7000-8000-00000000dead"),
    ).rejects.toMatchObject({ reason: "EXPORT_NOT_FOUND" });
  });

  it("gives 15-minute links in a subject's export too", async () => {
    const organizationId = await agency();
    const recordId = "0199e7a0-0000-7000-8000-00000000f11e";
    await test.services.db.forOrg(organizationId, async (tx) => {
      const file = await tx.attachment.create({
        data: {
          recordType: "traveller",
          recordId,
          fileName: "Passport.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          status: "ready",
          confirmedAt: new Date(),
        },
      });
      await test.storage.put({
        key: `organizations/${organizationId}/attachments/${file.id}`,
        contentType: "application/pdf",
        body: new Uint8Array([1, 2, 3]),
      });
    });
    const before = Date.now();
    const exported = await exportSubject(test.services, support, {
      organizationId,
      subject: { kind: "record", recordType: "traveller", recordId },
    });
    // The memory store writes each link's expiry, in milliseconds, into it.
    const expires = Number(new URL(exported.files[0]?.downloadUrl ?? "memory://x").searchParams.get("expires"));
    expect(expires - before).toBeGreaterThan(14 * 60 * 1000);
    expect(expires - before).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });

  it("marks an export failed when an attempt fails, and a retry finishes it, logged once", async () => {
    const organizationId = await agency();
    let failures = 1;
    const flaky: ObjectStorage = {
      ...test.storage,
      put: (object) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(new Error("storage is down"));
        }
        return test.storage.put(object);
      },
    };
    const services = { ...test.services, storage: flaky };
    const requested = await requestOrganizationExport(services, support, organizationId);
    await expect(runOrganizationExport(services, { exportId: requested.exportId })).rejects.toThrow("storage is down");
    expect((await listOrganizationExports(services, organizationId))[0]?.state).toBe("failed");

    await runOrganizationExport(services, { exportId: requested.exportId });
    await runOrganizationExport(services, { exportId: requested.exportId });
    expect((await listOrganizationExports(services, organizationId))[0]).toMatchObject({ state: "done", parts: 1 });
    const actions = (await logOf(organizationId)).map((entry) => entry.action);
    expect(actions.filter((action) => action === "organization.exported")).toHaveLength(1);
  });

  it("says so, in words the failed-jobs list keeps, when a failed export can't even be marked failed", async () => {
    const organizationId = await agency();
    let broken = false;
    const platformDb: PlatformDatabase = {
      ...test.services.platformDb,
      transaction: (fn, options) =>
        broken ? Promise.reject(new Error("database is down")) : test.services.platformDb.transaction(fn, options),
    };
    const storage: ObjectStorage = {
      ...test.storage,
      put: () => {
        broken = true;
        return Promise.reject(new Error("storage is down"));
      },
    };
    const services = { ...test.services, platformDb, storage };
    const { exportId } = await requestOrganizationExport(services, support, organizationId);
    const failure = await runOrganizationExport(services, { exportId }).then(
      () => null,
      (error: unknown) => error,
    );
    expect(sanitizeJobError(failure).message).toBe(
      `AggregateError: Export ${exportId} failed, and could not be marked failed`,
    );
    expect(failure).toMatchObject({ cause: { message: "storage is down" } });
  });

  it("counts an export for a purge only for the organization it was of", async () => {
    const [organizationId, other] = [await agency(), await agency()];
    await exportOrganizationNow(test.services, organizationId);
    const counts = (targetId: string, of: string) =>
      test.services.platformDb.transaction((tx) =>
        exportedRecently(tx, "organization.exported", targetId, new Date(), of),
      );
    expect(await counts(organizationId, organizationId)).toBe(true);
    expect(await counts(organizationId, other)).toBe(false);
    expect(await counts(other, other)).toBe(false);
  });

  it("reads only an organization's own tables, as the organization asOrganization set", async () => {
    const organizationId = await agency();
    const rowsOf = (table: string) =>
      test.services.platformDb.transaction((tx) =>
        asOrganization(
          tx,
          organizationId,
          (orgTx) => orgTx.$queryRaw<unknown[]>`SELECT * FROM app_export_organization_rows(${table}, NULL, 10)`,
        ),
      );
    expect(await rowsOf("organization")).toHaveLength(1);
    for (const table of ["user", "platform_audit_entry", "webhook_event", 'organization"; --']) {
      await expect(rowsOf(table), table).rejects.toThrow(/not a table of an organization's rows/);
    }
    // The platform role itself may not call it: only app_runtime, inside an organization.
    await expect(
      test.services.platformDb.transaction(
        (tx) => tx.$queryRaw`SELECT * FROM app_export_organization_rows('organization', NULL, 10)`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
