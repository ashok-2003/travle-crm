// An erasure withdraws every stored export of its organization, in its own transaction: an export is kept for 7 days,
// and the erased person must not stay in one. How a withdrawn export is cleared from storage is the export's own test
// (organization-export-expiry.test.ts); here, that the erasure job withdraws it, with the erasure and not apart.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { erasureJobOf } from "../../src/platform/erasure.js";
import { EXPIRE_EXPORTS_QUEUE, eraseSubject, requestErasure } from "../../src/platform/index.js";
import { deletionAgency, exportTraveller, storedFile, traveller } from "./test-deletion.js";
import { exportOrganizationNow } from "./test-exports.js";
import { createTestPlan, createTestPlatform, support, type TestPlatform } from "./test-platform.js";

/** Links handed out last 15 minutes: the clearing waits for those given before the erasure to lapse. */
const CLEAR_AFTER_MS = 15 * 60 * 1000;

describe("an erasure's stored exports", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  it("withdraws every export of the organization in the erasure's own transaction, and queues their clearing", async () => {
    const { organizationId, code } = await deletionAgency(test, plan);
    await storedFile(test, organizationId, "Passport.pdf");
    const exported = await exportOrganizationNow(test.services, organizationId);
    await exportTraveller(test.services, organizationId);
    const subject = { kind: "record" as const, recordType: "traveller", recordId: traveller };
    await requestErasure(test.services, support, { organizationId, subject, confirmation: code });
    const sent = test.queue.sent.at(-1);
    if (!sent) throw new Error("no erasure job was queued");
    const now = new Date();

    await eraseSubject(test.services, erasureJobOf(sent.data), now);

    const { row, entries } = await test.services.platformDb.transaction(async (tx) => ({
      row: await tx.platformExport.findUniqueOrThrow({ where: { id: exported.exportId } }),
      entries: await tx.platformAuditEntry.findMany({
        where: {
          targetOrganizationId: organizationId,
          action: { in: ["organization.export-expired", "subject.erased"] },
        },
        orderBy: { id: "asc" },
      }),
    }));
    expect(row).toMatchObject({ state: "expired", expiredAt: now });
    expect(entries.map((entry) => [entry.action, entry.after])).toEqual([
      ["organization.export-expired", { exportId: exported.exportId, reason: "erasure" }],
      ["subject.erased", expect.objectContaining({ exportsExpired: 1 })],
    ]);
    const clearing = test.queue.sent.filter(
      (job) => job.queue === EXPIRE_EXPORTS_QUEUE && job.data.organizationId === organizationId,
    );
    expect(clearing.map((job) => job.options.startAfter?.getTime())).toEqual([now.getTime() + CLEAR_AFTER_MS]);
  });
});
