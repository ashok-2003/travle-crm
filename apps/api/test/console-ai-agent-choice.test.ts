// The console's choice of an agency's agent: support can read it, only a super admin changes it, and an unknown agent
// is refused.
import type { OrganizationAgentChoice } from "@travel-crm/contracts/platform";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { createTestOrganization } from "@travel-crm/db/testing";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { createPlan } from "@travel-crm/domain/platform";
import { startSubscription } from "@travel-crm/domain/subscriptions";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

describe("the console's choice of an agency's agent", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;
  let plan: PlanSummary;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
    plan = await createPlan(
      testConsole.services,
      { userId: superAdmin.userId },
      {
        key: `starter-${crypto.randomUUID().slice(0, 8)}`,
        name: "Starter",
        monthlyPricePaise: 250_000,
        yearlyPricePaise: null,
        seatLimit: 5,
        whatsappNumberLimit: 1,
        storageLimitBytes: 5_000_000_000,
        modules: ["crm"],
      },
    );
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  async function subscribedOrganization(): Promise<string> {
    const organizationId = await createTestOrganization(server.platform, "Agent choice");
    await testConsole.services.platformDb.transaction((tx) =>
      startSubscription(
        tx,
        { userId: support.userId },
        {
          organizationId,
          planId: plan.id,
          billingCycle: "monthly",
          trialEndsOn: null,
          paidThrough: addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 365),
        },
      ),
    );
    return organizationId;
  }

  it("lets support read the choice and refuses support's change; a super admin changes it", async () => {
    const organizationId = await subscribedOrganization();
    expect(
      await dataOf<OrganizationAgentChoice>(
        await consoleQuery(testConsole, "aiAgent.agentChoice", support.jar, { organizationId }),
      ),
    ).toMatchObject({ agent: "lite", lastReplay: null });
    expect(
      await refusalOf(
        await consoleMutate(testConsole, "aiAgent.chooseAgent", { organizationId, agent: "natural" }, support.jar),
      ),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(
      await dataOf<OrganizationAgentChoice>(
        await consoleMutate(testConsole, "aiAgent.chooseAgent", { organizationId, agent: "natural" }, superAdmin.jar),
      ),
    ).toMatchObject({ agent: "natural" });
    expect(
      await dataOf<OrganizationAgentChoice>(
        await consoleQuery(testConsole, "aiAgent.agentChoice", support.jar, { organizationId }),
      ),
    ).toMatchObject({ agent: "natural" });
  });

  it("refuses an unknown agent", async () => {
    const organizationId = await subscribedOrganization();
    expect(
      (
        await refusalOf(
          await consoleMutate(testConsole, "aiAgent.chooseAgent", { organizationId, agent: "robot" }, superAdmin.jar),
        )
      ).status,
    ).toBe(400);
  });
});
