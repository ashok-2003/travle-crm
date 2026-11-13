// The console's lite-agent switch: support can read it, only a super admin changes it.
import type { OrganizationLiteAgent } from "@travel-crm/contracts/platform";
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

describe("the console's lite-agent switch", () => {
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
    const organizationId = await createTestOrganization(server.platform, "Subscriber");
    const start = {
      organizationId,
      planId: plan.id,
      billingCycle: "monthly",
      trialEndsOn: null,
      paidThrough: addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 365),
    } as const;
    await testConsole.services.platformDb.transaction((tx) => startSubscription(tx, { userId: support.userId }, start));
    return organizationId;
  }

  it("support reads the switch but can't set it; a super admin switches one agency on and back", async () => {
    const organizationId = await subscribedOrganization();
    expect(
      await dataOf<OrganizationLiteAgent>(
        await consoleQuery(testConsole, "aiAgent.liteAgent", support.jar, { organizationId }),
      ),
    ).toEqual({ lite: false, answering: false });
    expect(
      await refusalOf(
        await consoleMutate(testConsole, "aiAgent.setLiteAgent", { organizationId, lite: true }, support.jar),
      ),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });

    expect(
      await dataOf<OrganizationLiteAgent>(
        await consoleMutate(testConsole, "aiAgent.setLiteAgent", { organizationId, lite: true }, superAdmin.jar),
      ),
    ).toEqual({ lite: true, answering: false });
    expect(
      await dataOf<OrganizationLiteAgent>(
        await consoleQuery(testConsole, "aiAgent.liteAgent", support.jar, { organizationId }),
      ),
    ).toEqual({ lite: true, answering: false });
    expect(
      await dataOf<OrganizationLiteAgent>(
        await consoleMutate(testConsole, "aiAgent.setLiteAgent", { organizationId, lite: false }, superAdmin.jar),
      ),
    ).toEqual({ lite: false, answering: false });
  });
});
