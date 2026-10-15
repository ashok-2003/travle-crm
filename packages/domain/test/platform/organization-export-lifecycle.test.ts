// An export's life after its job: links that last 15 minutes, each download in the platform log; a failed attempt
// marked and finished by a retry; a repeated job that does nothing; and, after 7 days, its parts deleted and the
// export marked expired. Also the database function it reads with, which only reads an organization's own tables.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { asOrganization } from "@travel-crm/db/platform";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  downloadOrganizationExport,
  expireOrganizationExports,
  listOrganizationExports,
  listPlatformLog,
  onboardOrganization,
  requestOrganizationExport,
  runOrganizationExport,
} from "../../src/platform/index.js";
import { exportedRecently } from "../../src/platform/exports.js";
import { exportOrganizationNow, exportParts } from "./test-exports.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

const DAY_MS = 24 * 60 * 60 * 1000;

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

  it("deletes an export's parts after its 7 days, marks it expired, and logs it; a newer one stays", async () => {
    const organizationId = await agency();
    // Asked for 8 days ago, so due now. (Other test files' exports, asked for today, are not, so they are left alone.)
    const old = await requestOrganizationExport(
      test.services,
      support,
      organizationId,
      new Date(Date.now() - 8 * DAY_MS),
    );
    await runOrganizationExport(test.services, { exportId: old.exportId });
    const recent = await exportOrganizationNow(test.services, organizationId);
    expect(exportParts(test.storage, old)).toHaveLength(1);

    expect(await expireOrganizationExports(test.services)).toBeGreaterThanOrEqual(1);
    expect(exportParts(test.storage, old)).toEqual([]);
    expect(exportParts(test.storage, recent)).toHaveLength(1);
    const exports = await listOrganizationExports(test.services, organizationId);
    expect(exports.map((exported) => [exported.exportId, exported.state])).toEqual([
      [recent.exportId, "done"],
      [old.exportId, "expired"],
    ]);
    await expect(downloadOrganizationExport(test.services, support, old.exportId)).rejects.toMatchObject({
      reason: "EXPORT_EXPIRED",
    });
    expect((await logOf(organizationId)).find((entry) => entry.action === "organization.export-expired")).toMatchObject(
      { actorUserId: null, after: { exportId: old.exportId, parts: 1 } },
    );
    // Again: nothing more is due.
    expect(await expireOrganizationExports(test.services)).toBe(0);
  });

  it("counts an export for a purge only for the organization it was of", async () => {
    const [organizationId, other] = [await agency(), await agency()];
    await exportOrganizationNow(test.services, organizationId);
    const counts = (targetId: string, of?: string) =>
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
