// The nightly demo reset (spec 7.4: "one shared demo with realistic sample data, reset nightly by a job"): it builds
// the demo organization, and each night purges it and builds it again, so whatever visitors changed is gone. Its
// staff sign in with its code, their username and the demo password. It is on the demo's own plan, never one on sale,
// and it never touches an organization it didn't build, even one that has the demo's code.
import { randomUUID } from "node:crypto";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findOrganizationRecord } from "../../src/identity/index.js";
import {
  listPlatformLog,
  onboardOrganization,
  resetDemoOrganization,
  type DemoSettings,
} from "../../src/platform/index.js";
import { getOrganizationProfile } from "../../src/profile/index.js";
import { DEMO_PLAN_KEY, getSubscription, listPlans } from "../../src/subscriptions/index.js";
import { canSignInByUsername } from "../identity/test-identity.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("the demo reset", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const demoSettings = (): DemoSettings => ({
    code: `D${randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`,
    password: "demo-password-123",
  });

  const organizationEntries = (organizationId: string) =>
    test.services.platformDb.transaction(async (tx) =>
      (await listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 })).entries.map((entry) => ({
        action: entry.action,
        actorUserId: entry.actorUserId,
      })),
    );

  it("builds the demo on its own plan, whose staff sign in with its code and the demo password", async () => {
    const demo = demoSettings();
    // 20:00 UTC is already the 17th in India: the demo is paid a month from the day there.
    const { organizationId } = await resetDemoOrganization(test.services, demo, new Date("2026-10-16T20:00:00Z"));
    for (const username of ["asha", "ravi", "meena"]) {
      expect(await canSignInByUsername(test.identity.identity, demo.code, username, demo.password)).toBe(true);
    }
    const { subscription, onSale } = await test.services.platformDb.transaction(async (tx) => ({
      subscription: await getSubscription(tx, organizationId),
      onSale: await listPlans(tx, { includeArchived: false }),
    }));
    expect(subscription).toMatchObject({ status: "active", paidThrough: "2026-11-16", plan: { key: DEMO_PLAN_KEY } });
    // Plans are global: the demo's is never offered to an agency.
    expect(onSale.map((candidate) => candidate.key)).not.toContain(DEMO_PLAN_KEY);
    expect(await test.services.db.forOrg(organizationId, getOrganizationProfile)).toMatchObject({
      legalName: "Demo Holidays Private Limited",
      invoicePrefix: "DH",
    });
    expect(await organizationEntries(organizationId)).toEqual([{ action: "demo.reset", actorUserId: null }]);
  });

  it("purges last night's demo and builds it afresh", async () => {
    const demo = demoSettings();
    const first = await resetDemoOrganization(test.services, demo);
    const second = await resetDemoOrganization(test.services, demo);
    expect(second.organizationId).not.toBe(first.organizationId);
    await expect(
      test.services.platformDb.transaction((tx) => findOrganizationRecord(tx, first.organizationId)),
    ).rejects.toMatchObject({ reason: "ORGANIZATION_NOT_FOUND" });
    expect(await organizationEntries(first.organizationId)).toEqual([
      { action: "organization.purged", actorUserId: null },
      { action: "demo.reset", actorUserId: null },
    ]);
    expect(await canSignInByUsername(test.identity.identity, demo.code, "asha", demo.password)).toBe(true);
  });

  it("never purges an organization it didn't build, even one with the demo's code", async () => {
    const input = onboardingInput(plan);
    const { organizationId } = await onboardOrganization(test.services, support, input);
    await expect(resetDemoOrganization(test.services, { ...demoSettings(), code: input.code })).rejects.toMatchObject({
      reason: "DEMO_CODE_TAKEN",
    });
    await expect(
      test.services.platformDb.transaction((tx) => findOrganizationRecord(tx, organizationId)),
    ).resolves.toMatchObject({ code: input.code });
  });
});
