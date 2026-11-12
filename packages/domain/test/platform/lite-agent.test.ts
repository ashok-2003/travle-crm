// The console's lite-agent switch: a change is written in the agency's audit log under the admin's name and once in the
// platform log; asking for the state it is in changes and logs nothing.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createTestOrganization } from "@travel-crm/db/testing";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import {
  listPlatformLog,
  onboardOrganization,
  organizationLiteAgent,
  setOrganizationLiteAgent,
} from "../../src/platform/index.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("switching an agency to the lite agent from the console", () => {
  let test: TestPlatform;
  let platform: PlatformClient;

  beforeAll(() => {
    test = createTestPlatform();
    platform = createPlatformClient(inject("dbUrls").platform);
  });
  afterAll(async () => {
    await platform.$disconnect();
    await test.close();
  });

  it("switching on audits under the admin's name and logs once; again changes nothing; off logs lite-off", async () => {
    const plan = await createTestPlan(test);
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const admin = { userId: randomUUID() };
    expect(await organizationLiteAgent(test.services, organizationId)).toEqual({ lite: false });

    expect(await setOrganizationLiteAgent(test.services, admin, { organizationId, lite: true })).toEqual({
      lite: true,
    });
    expect(await organizationLiteAgent(test.services, organizationId)).toEqual({ lite: true });
    await setOrganizationLiteAgent(test.services, admin, { organizationId, lite: true });
    expect(await setOrganizationLiteAgent(test.services, admin, { organizationId, lite: false })).toEqual({
      lite: false,
    });
    await setOrganizationLiteAgent(test.services, admin, { organizationId, lite: false });

    const own = await platform.auditEntry.findMany({
      where: { organizationId, action: { startsWith: "ai-agent.lite" } },
      orderBy: { id: "asc" },
    });
    expect(own).toMatchObject([
      { action: "ai-agent.lite-on", source: "platform", actorUserId: admin.userId, entityType: "ai_autopilot" },
      { action: "ai-agent.lite-off", source: "platform", actorUserId: admin.userId },
    ]);
    const page = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    const logged = page.entries.filter((entry) => entry.action.startsWith("ai-agent.lite"));
    expect(logged.map((entry) => entry.action)).toEqual(["ai-agent.lite-off", "ai-agent.lite-on"]);
  });

  it("an unknown organization is NOT_FOUND, and a change needs the admin's id", async () => {
    const isNotFound = (error: unknown) => error instanceof DomainError && error.code === "NOT_FOUND";
    await expect(organizationLiteAgent(test.services, randomUUID())).rejects.toSatisfy(isNotFound);
    await expect(
      setOrganizationLiteAgent(test.services, { userId: randomUUID() }, { organizationId: randomUUID(), lite: true }),
    ).rejects.toSatisfy(isNotFound);
    const organizationId = await createTestOrganization(platform, "Admin-less");
    await expect(
      setOrganizationLiteAgent(test.services, { userId: null }, { organizationId, lite: true }),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
