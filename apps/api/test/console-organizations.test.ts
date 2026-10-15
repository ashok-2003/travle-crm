// Onboarding through the console (spec 7.1), end to end: support onboards an agency, the worker emails its Owner an
// invite, the Owner chooses a password from the link, signs in, and finds the subscription the console started.
import type { OnboardedOrganization, OnboardOrganizationInput } from "@travel-crm/contracts/platform";
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { createPlan } from "@travel-crm/domain/platform";
import { runListenerJob } from "@travel-crm/domain/jobs";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { signedInOwner } from "./support/people.js";
import { createTestAgency, createTestServer, postJson, signInByEmail, type TestServer } from "./support/test-server.js";
import { dataOf, query, refusalOf } from "./support/trpc.js";

describe("onboarding through the console", () => {
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let input: OnboardOrganizationInput;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    support = await signedInPlatformStaff(server, "support");
    const plan = await createPlan(
      testConsole.services,
      { userId: support.userId },
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
    const code = `K${crypto.randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    input = {
      name: "Kerala Trails",
      code,
      timeZone: "Asia/Kolkata",
      contactEmail: `hello-${code.toLowerCase()}@example.test`,
      profile: {
        legalName: "Kerala Trails LLP",
        gstin: null,
        gstStateCode: "32",
        contactName: null,
        contactPhone: null,
      },
      owner: { name: "Lakshmi Nair", email: `lakshmi-${code.toLowerCase()}@example.test` },
      // A month's trial from today, whatever today is.
      subscription: {
        planId: plan.id,
        billingCycle: "monthly",
        trialEndsOn: addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 30),
        paidThrough: null,
      },
    };
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("onboards an agency whose Owner chooses a password from the invite, signs in and sees the trial", async () => {
    const onboarded = await dataOf<OnboardedOrganization>(
      await consoleMutate(testConsole, "organizations.onboard", input, support.jar),
    );
    // The worker's part: the invite listener on the staff.invited event.
    const email = createMemoryEmailSender();
    const event = await server.db.forOrg(onboarded.organizationId, (tx) =>
      tx.outboxEvent.findFirstOrThrow({ where: { type: "staff.invited" } }),
    );
    await runListenerJob({
      db: server.db,
      listener: server.identity.inviteListener({
        email,
        appUrl: "http://localhost",
        limiter: createRateLimiter(server.db, { keySecret: "console-organizations-test-secret-32-bytes" }),
      }),
      data: { organizationId: onboarded.organizationId, eventId: event.id, eventType: event.type },
    });
    const token = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(email.sent[0]?.text ?? "")?.[1];
    const chosen = await postJson(server, "/api/auth/reset-password", { token, newPassword: "lakshmi-password-1" });
    expect(chosen.status).toBe(200);
    const owner = new CookieJar();
    expect((await signInByEmail(server, owner, input.owner.email, "lakshmi-password-1")).status).toBe(200);
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "trial",
      planName: "Starter",
      modules: ["crm"],
      trialEndsOn: input.subscription.trialEndsOn,
    });
  });

  it("shows the organization, and refuses a GSTIN of another state", async () => {
    const other = {
      ...input,
      code: `${input.code.slice(0, 9)}X`,
      owner: { ...input.owner, email: `x-${input.owner.email}` },
    };
    const onboarded = await dataOf<OnboardedOrganization>(
      await consoleMutate(testConsole, "organizations.onboard", other, support.jar),
    );
    expect(
      await dataOf(
        await consoleQuery(testConsole, "organizations.get", support.jar, { organizationId: onboarded.organizationId }),
      ),
    ).toMatchObject({ organization: { code: other.code }, subscription: { subscription: { status: "trial" } } });
    const wrongState = { ...input, profile: { ...input.profile, gstin: "27AAPFU0939F1ZV" } };
    expect((await consoleMutate(testConsole, "organizations.onboard", wrongState, support.jar)).status).toBe(400);
  });

  it("is out of reach of an organization's own staff", async () => {
    const agency = await createTestAgency(server);
    expect(
      await refusalOf(
        await consoleMutate(testConsole, "organizations.onboard", input, await signedInOwner(server, agency)),
      ),
    ).toEqual({ status: 403, reason: "PLATFORM_ONLY" });
  });
});
