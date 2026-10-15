// Onboarding from the console (spec 7.1): one platform transaction makes the organization, its roles, its business
// profile, its subscription and its invited Owner, all recorded under the platform admin's name; any step failing
// leaves nothing; the console shows and corrects what it made.
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archivePlan,
  getOrganization,
  listPlatformLog,
  onboardOrganization,
  resendInvite,
  updateOrganization,
} from "../../src/platform/index.js";
import {
  createTestPlan,
  createTestPlatform,
  onboardingInput,
  support,
  supportUserId,
  type TestPlatform,
} from "./test-platform.js";

describe("onboarding", () => {
  let test: TestPlatform;
  let plan: PlanSummary;

  beforeAll(async () => {
    test = createTestPlatform();
    plan = await createTestPlan(test);
  });

  afterAll(async () => {
    await test.close();
  });

  const inOrganization = <T>(organizationId: string, fn: Parameters<typeof test.services.db.forOrg<T>>[1]) =>
    test.services.db.forOrg(organizationId, fn);

  it("makes the organization, its roles, profile, subscription and invited Owner, under the admin's name", async () => {
    const input = onboardingInput(plan);
    const onboarded = await onboardOrganization(test.services, support, input);
    const { organizationId } = onboarded;
    expect(await inOrganization(organizationId, (tx) => tx.role.count())).toBe(5);
    const details = await getOrganization(test.services, organizationId);
    expect(details).toMatchObject({
      organization: {
        name: "Sharma Holidays",
        code: input.code,
        timeZone: "Asia/Kolkata",
        contactEmail: input.contactEmail,
      },
      profile: { legalName: "Sharma Holidays Private Limited", gstStateCode: "27", contactPhone: "+919876543210" },
      subscription: {
        subscription: { status: "trial", trialEndsOn: input.subscription.trialEndsOn, plan: { id: plan.id } },
        payments: [],
      },
    });
    const entries = await inOrganization(organizationId, (tx) => tx.auditEntry.findMany({ orderBy: { id: "asc" } }));
    expect(entries.map((entry) => entry.action)).toEqual([
      "organization-profile.saved",
      "staff.created",
      "staff.invited",
      "organization.onboarded",
      "subscription.started",
    ]);
    expect(entries.every((entry) => entry.source === "platform" && entry.actorUserId === supportUserId)).toBe(true);
    const invites = await inOrganization(organizationId, (tx) =>
      tx.outboxEvent.findMany({ where: { type: "staff.invited" } }),
    );
    expect(invites.map((event) => event.payload)).toEqual([
      expect.objectContaining({ memberId: onboarded.ownerMemberId }),
    ]);
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 10 }),
    );
    expect(log.entries).toEqual([
      expect.objectContaining({ action: "organization.onboarded", actorUserId: supportUserId }),
    ]);
  });

  it("leaves nothing behind when its last step fails", async () => {
    const retired = await createTestPlan(test);
    await archivePlan(test.services, support, retired.id);
    const input = onboardingInput(retired);
    await expect(onboardOrganization(test.services, support, input)).rejects.toMatchObject({ reason: "PLAN_ARCHIVED" });
    const client = test.identity.database.client;
    expect(await client.organization.count({ where: { code: input.code } })).toBe(0);
    expect(await client.user.count({ where: { email: input.owner.email } })).toBe(0);
  });

  it("refuses a code another organization has", async () => {
    const input = onboardingInput(plan);
    await onboardOrganization(test.services, support, input);
    await expect(
      onboardOrganization(test.services, support, { ...onboardingInput(plan), code: input.code }),
    ).rejects.toMatchObject({ reason: "ORGANIZATION_CODE_TAKEN" });
  });

  it("sends the Owner a new invite, and corrects the organization's row in both logs", async () => {
    const { organizationId, ownerMemberId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    await resendInvite(test.services, support, { organizationId, memberId: ownerMemberId });
    expect(
      await inOrganization(organizationId, (tx) => tx.outboxEvent.count({ where: { type: "staff.invited" } })),
    ).toBe(2);
    const updated = await updateOrganization(test.services, support, {
      organizationId,
      name: "Sharma Holidays & Tours",
      timeZone: "Asia/Kolkata",
      contactEmail: null,
    });
    expect(updated).toMatchObject({ name: "Sharma Holidays & Tours", contactEmail: null });
    const entry = await inOrganization(organizationId, (tx) =>
      tx.auditEntry.findFirstOrThrow({ where: { action: "organization.updated" } }),
    );
    expect(entry).toMatchObject({
      source: "platform",
      before: { name: "Sharma Holidays", contactEmail: true },
      after: { name: "Sharma Holidays & Tours", contactEmail: false },
    });
    // The platform log outlives a purge, and a sole proprietor's agency is often named after them: only a flag.
    const log = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 1 }),
    );
    expect(log.entries[0]).toMatchObject({
      action: "organization.updated",
      before: { timeZone: "Asia/Kolkata", contactEmail: true },
      after: { nameChanged: true, timeZone: "Asia/Kolkata", contactEmail: false },
    });
    expect(JSON.stringify(log.entries[0])).not.toContain("Sharma");
  });

  it("shows the organization's bank account by its last four digits only", async () => {
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    await inOrganization(organizationId, (tx) =>
      tx.organizationProfile.update({ where: { organizationId }, data: { bankAccountNumber: "001234567890" } }),
    );
    expect((await getOrganization(test.services, organizationId)).profile?.bankAccountNumber).toBe("XXXX7890");
  });

  it("says when an organization doesn't exist", async () => {
    await expect(getOrganization(test.services, "0199e7a0-0000-7000-8000-0000000000ab")).rejects.toMatchObject({
      reason: "ORGANIZATION_NOT_FOUND",
    });
  });
});
