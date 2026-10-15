// What a purge relies on (spec 5: "export, typed confirmation, purge job"): a fresh export of the organization, done in
// the last day and still kept. The "organization.exported" log entry stays when an erasure withdraws the export; the
// check doesn't count a withdrawn one, an expired one, an unfinished one, or another organization's.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  expireOrganizationExports,
  hasFreshExport,
  onboardOrganization,
  requestOrganizationExport,
} from "../../src/platform/index.js";
import { exportOrganizationNow } from "./test-exports.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("a fresh export", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const agency = async () => (await onboardOrganization(test.services, support, onboardingInput(plan))).organizationId;
  const fresh = (organizationId: string, now = new Date()) =>
    test.services.platformDb.transaction((tx) => hasFreshExport(tx, organizationId, now));

  it("is a done export of the organization from the last day", async () => {
    const [organizationId, other] = [await agency(), await agency()];
    expect(await fresh(organizationId)).toBe(false);
    await requestOrganizationExport(test.services, support, organizationId);
    // Asked for, not yet written.
    expect(await fresh(organizationId)).toBe(false);
    await exportOrganizationNow(test.services, organizationId);
    expect(await fresh(organizationId)).toBe(true);
    expect(await fresh(other)).toBe(false);
    // A day and more later it is no longer fresh, though kept for its 7 days.
    expect(await fresh(organizationId, new Date(Date.now() + DAY_MS + 60_000))).toBe(false);
  });

  it("no longer counts once an erasure has withdrawn it, though its log entry stays", async () => {
    const organizationId = await agency();
    await exportOrganizationNow(test.services, organizationId);
    expect(await fresh(organizationId)).toBe(true);
    await test.services.platformDb.transaction((tx) =>
      expireOrganizationExports(test.services, tx, organizationId, "erasure"),
    );
    expect(await fresh(organizationId)).toBe(false);
    const entries = await test.services.platformDb.transaction((tx) =>
      tx.platformAuditEntry.count({ where: { action: "organization.exported", targetOrganizationId: organizationId } }),
    );
    expect(entries).toBe(1);
  });
});
