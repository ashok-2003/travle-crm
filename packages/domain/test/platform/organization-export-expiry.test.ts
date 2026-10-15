// An export's end: after its 7 days, or withdrawn by an erasure in its organization's transaction (from the commit, no
// download), then the expiry job deletes its parts and its copies of the organization's files. A rolled-back erasure
// withdraws nothing, and an export being written when it is withdrawn stores nothing more and leaves no copy behind.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import type { ObjectStorage } from "@travel-crm/integrations/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  deleteExpiredExports,
  downloadOrganizationExport,
  EXPIRE_EXPORTS_QUEUE,
  expireOrganizationExports,
  listOrganizationExports,
  listPlatformLog,
  onboardOrganization,
  requestOrganizationExport,
  runOrganizationExport,
} from "../../src/platform/index.js";
import { exportOrganizationNow } from "./test-exports.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("an export's end", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  /** An onboarded agency with one stored file. */
  async function agencyWithFile(): Promise<string> {
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    await test.services.db.forOrg(organizationId, async (tx) => {
      const file = await tx.attachment.create({
        data: {
          recordType: "traveller",
          recordId: "0199e7a0-0000-7000-8000-00000000f11e",
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
    return organizationId;
  }

  /** What the export keeps in storage: its parts and its file copies. */
  const storedFor = (exported: { organizationId: string; exportId: string }) =>
    [...test.storage.objects.keys()].filter((key) =>
      key.startsWith(`platform/exports/${exported.organizationId}/${exported.exportId}/`),
    );

  async function expiriesOf(organizationId: string) {
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    return log.entries.filter((entry) => entry.action === "organization.export-expired").map((entry) => entry.after);
  }

  it("deletes an export's parts and copies after its 7 days, marks it expired, and logs it; a newer one stays", async () => {
    const organizationId = await agencyWithFile();
    // Asked for 8 days ago, so due now. (Other test files' exports, asked for today, are not, so they are left alone.)
    const old = await requestOrganizationExport(
      test.services,
      support,
      organizationId,
      new Date(Date.now() - 8 * DAY_MS),
    );
    await runOrganizationExport(test.services, { exportId: old.exportId });
    const recent = await exportOrganizationNow(test.services, organizationId);
    expect(storedFor(old).filter((key) => key.includes("/files/"))).toHaveLength(1);

    await deleteExpiredExports(test.services);
    expect(storedFor(old)).toEqual([]);
    expect(storedFor(recent)).toHaveLength(2);
    const exports = await listOrganizationExports(test.services, organizationId);
    expect(exports.map((exported) => [exported.exportId, exported.state])).toEqual([
      [recent.exportId, "done"],
      [old.exportId, "expired"],
    ]);
    await expect(downloadOrganizationExport(test.services, support, old.exportId)).rejects.toMatchObject({
      reason: "EXPORT_EXPIRED",
    });
    // Again: nothing more to do for it, nor a second entry.
    await deleteExpiredExports(test.services);
    expect(await expiriesOf(organizationId)).toEqual([{ exportId: old.exportId, reason: "time" }]);
  });

  it("withdraws an organization's exports in an erasure's transaction, then deletes them; another's stay", async () => {
    const organizationId = await agencyWithFile();
    const other = await agencyWithFile();
    const done = await exportOrganizationNow(test.services, organizationId);
    const waiting = await requestOrganizationExport(test.services, support, organizationId);
    const others = await exportOrganizationNow(test.services, other);

    const before = Date.now();
    const withdrawn = await test.services.platformDb.transaction((tx) =>
      expireOrganizationExports(test.services, tx, organizationId, "erasure"),
    );
    expect(withdrawn).toBe(2);
    await expect(downloadOrganizationExport(test.services, support, done.exportId)).rejects.toMatchObject({
      reason: "EXPORT_EXPIRED",
    });
    expect(
      (await expiriesOf(organizationId)).sort((a, b) => String(a?.exportId).localeCompare(String(b?.exportId))),
    ).toEqual([done.exportId, waiting.exportId].sort().map((exportId) => ({ exportId, reason: "erasure" })));
    // The deleting comes once the erasure has surely committed, and every link handed out has lapsed.
    const clearing = test.queue.sent.find(
      (job) => job.queue === EXPIRE_EXPORTS_QUEUE && job.data.organizationId === organizationId,
    );
    expect(clearing?.options.startAfter?.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
    // The export still waiting for its job is never written.
    await runOrganizationExport(test.services, { exportId: waiting.exportId });
    expect(storedFor(waiting)).toEqual([]);

    await deleteExpiredExports(test.services);
    expect(storedFor(done)).toEqual([]);
    expect(storedFor(others)).toHaveLength(2);
    await expect(downloadOrganizationExport(test.services, support, others.exportId)).resolves.toMatchObject({
      files: [expect.objectContaining({ fileId: expect.any(String) as string })],
    });
  });

  it("withdraws nothing when the erasure's transaction rolls back", async () => {
    const organizationId = await agencyWithFile();
    const done = await exportOrganizationNow(test.services, organizationId);
    await expect(
      test.services.platformDb.transaction(async (tx) => {
        await expireOrganizationExports(test.services, tx, organizationId, "erasure");
        throw new Error("the erasure failed");
      }),
    ).rejects.toThrow("the erasure failed");
    await deleteExpiredExports(test.services);
    expect((await listOrganizationExports(test.services, organizationId))[0]?.state).toBe("done");
    expect(storedFor(done)).toHaveLength(2);
    expect(await expiriesOf(organizationId)).toEqual([]);
  });

  it("stops an export being written when it is withdrawn, and leaves no copy of a file behind", async () => {
    const organizationId = await agencyWithFile();
    // The erasure commits while the job copies the organization's file.
    const racing: ObjectStorage = {
      ...test.storage,
      copy: async (from, to) => {
        await test.services.platformDb.transaction((tx) =>
          expireOrganizationExports(test.services, tx, organizationId, "erasure"),
        );
        return test.storage.copy(from, to);
      },
    };
    const services = { ...test.services, storage: racing };
    const requested = await requestOrganizationExport(services, support, organizationId);
    await expect(runOrganizationExport(services, { exportId: requested.exportId })).resolves.toBeUndefined();
    expect(storedFor(requested).filter((key) => key.includes("/files/"))).toEqual([]);
    const [stopped] = await listOrganizationExports(services, organizationId);
    expect(stopped).toMatchObject({ state: "expired", parts: null });

    await deleteExpiredExports(test.services);
    expect(storedFor(requested)).toEqual([]);
  });
});
