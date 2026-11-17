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

  it("reads natural for a new agency, moves it to lite and back, and a repeat logs nothing", async () => {
    const plan = await createTestPlan(test);
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const admin = { userId: randomUUID() };
    expect(await organizationAgentChoice(test.services, organizationId)).toEqual({
      agent: "natural",
      lastReplay: null,
      replaying: false,
    });
    expect(await chooseOrganizationAgent(test.services, admin, { organizationId, agent: "lite" })).toMatchObject({
      agent: "lite",
    });
    await chooseOrganizationAgent(test.services, admin, { organizationId, agent: "lite" });
    expect((await organizationAgentChoice(test.services, organizationId)).agent).toBe("lite");
    await chooseOrganizationAgent(test.services, admin, { organizationId, agent: "natural" });

    const own = await platform.auditEntry.findMany({
      where: { organizationId, action: "ai-agent.agent-changed" },
      orderBy: { id: "asc" },
    });
    expect(own).toMatchObject([
      { source: "platform", actorUserId: admin.userId, before: { agent: "natural" }, after: { agent: "lite" } },
      { source: "platform", actorUserId: admin.userId, before: { agent: "lite" }, after: { agent: "natural" } },
    ]);
    const page = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    expect(page.entries.filter((entry) => entry.action === "ai-agent.agent-chosen")).toHaveLength(2);
  });

  it("writes a move to one to the platform log and the agency's audit log", async () => {
    const plan = await createTestPlan(test);
    const { organizationId } = await onboardOrganization(test.services, support, onboardingInput(plan));
    const admin = { userId: randomUUID() };
    expect(await chooseOrganizationAgent(test.services, admin, { organizationId, agent: "one" })).toMatchObject({
      agent: "one",
    });
    const own = await platform.auditEntry.findMany({ where: { organizationId, action: "ai-agent.agent-changed" } });
    expect(own).toMatchObject([{ source: "platform", before: { agent: "natural" }, after: { agent: "one" } }]);
    const page = await test.services.platformDb.transaction((tx) =>
      listPlatformLog(tx, { targetOrganizationId: organizationId, limit: 50 }),
    );
    expect(page.entries.filter((entry) => entry.action === "ai-agent.agent-chosen")).toHaveLength(1);
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
