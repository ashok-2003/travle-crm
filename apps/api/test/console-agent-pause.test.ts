// The console's pause of the WhatsApp agent: support can read it, only a super admin changes it. Pausing every agency
// is proven here by refusal alone (its row is shared with other tests); a super admin's success is shown on one agency.
import type { OrganizationAgentPause, AgentPauseState } from "@travel-crm/contracts/platform";
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

describe("the console's pause of the WhatsApp agent", () => {
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

  it("support can read the pause but not change it; a super admin pauses and resumes one agency", async () => {
    const organizationId = await subscribedOrganization();
    expect(
      await dataOf<AgentPauseState>(await consoleQuery(testConsole, "aiAgent.pauseState", support.jar)),
    ).toHaveProperty("everyone");
    expect(
      await dataOf<OrganizationAgentPause>(
        await consoleQuery(testConsole, "aiAgent.organizationPause", support.jar, { organizationId }),
      ),
    ).toMatchObject({ agency: null });

    const forbidden = { status: 403, reason: "SUPER_ADMIN_ONLY" };
    expect(
      await refusalOf(await consoleMutate(testConsole, "aiAgent.pauseEveryone", { paused: true }, support.jar)),
    ).toEqual(forbidden);
    expect(
      await refusalOf(
        await consoleMutate(testConsole, "aiAgent.pauseOrganization", { organizationId, paused: true }, support.jar),
      ),
    ).toEqual(forbidden);

    const paused = await dataOf<OrganizationAgentPause>(
      await consoleMutate(testConsole, "aiAgent.pauseOrganization", { organizationId, paused: true }, superAdmin.jar),
    );
    expect(paused.agency).not.toBeNull();
    expect(
      await dataOf<OrganizationAgentPause>(
        await consoleQuery(testConsole, "aiAgent.organizationPause", support.jar, { organizationId }),
      ),
    ).toEqual(paused);
    expect(
      await dataOf<OrganizationAgentPause>(
        await consoleMutate(
          testConsole,
          "aiAgent.pauseOrganization",
          { organizationId, paused: false },
          superAdmin.jar,
        ),
      ),
    ).toMatchObject({ agency: null });
  });
});
