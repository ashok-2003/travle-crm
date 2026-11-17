// The console's choice of an agency's agent: read, changed under the admin's name, written to the agency's audit log and
// the platform log, and a repeat changes and logs nothing.
import { randomUUID } from "node:crypto";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import {
  chooseOrganizationAgent,
  listPlatformLog,
  onboardOrganization,
  organizationAgentChoice,
} from "../../src/platform/index.js";
import { createTestPlan, createTestPlatform, onboardingInput, support, type TestPlatform } from "./test-platform.js";

describe("choosing an agency's agent from the console", () => {
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

  it("reads lite for a new agency, moves it to natural and back, and a repeat logs nothing", async () => {
    const plan = await createTestPlan(test);
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const admin = { userId: randomUUID() };
    expect(await organizationAgentChoice(test.services, organizationId)).toEqual({
      agent: "lite",
      lastReplay: null,
      replaying: false,
    });
    expect(await chooseOrganizationAgent(test.services, admin, { organizationId, agent: "natural" })).toMatchObject({
      agent: "natural",
    });
    await chooseOrganizationAgent(test.services, admin, { organizationId, agent: "natural" });
    expect((await organizationAgentChoice(test.services, organizationId)).agent).toBe("natural");
    await chooseOrganizationAgent(test.services, admin, { organizationId, agent: "lite" });

    const own = await platform.auditEntry.findMany({
      where: { organizationId, action: "ai-agent.agent-changed" },
      orderBy: { id: "asc" },
    });
    expect(own).toMatchObject([
      { source: "platform", actorUserId: admin.userId, before: { agent: "lite" }, after: { agent: "natural" } },
      { source: "platform", actorUserId: admin.userId, before: { agent: "natural" }, after: { agent: "lite" } },
    ]);
    const page = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    expect(page.entries.filter((entry) => entry.action === "ai-agent.agent-chosen")).toHaveLength(2);
  });

  it("refuses an unknown organization", async () => {
    await expect(organizationAgentChoice(test.services, randomUUID())).rejects.toSatisfy(
      (error) => error instanceof DomainError && error.code === "NOT_FOUND",
    );
    await expect(
      chooseOrganizationAgent(
        test.services,
        { userId: randomUUID() },
        { organizationId: randomUUID(), agent: "natural" },
      ),
    ).rejects.toSatisfy((error) => error instanceof DomainError && error.code === "NOT_FOUND");
  });
});
