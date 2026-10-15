// One agency's whole life through the console, the api and the worker (spec 7): a super admin puts a plan on sale,
// support onboards the agency, the worker emails its Owner the invite, the Owner chooses a password, completes the
// business profile and branding and sees the trial; the trial lapses and the agency turns read-only, a payment makes it
// active again; then it is exported, cancelled and purged, and only the platform log remembers it.
import type { OnboardedOrganization, PlatformLogPage, QueuedJob } from "@travel-crm/contracts/platform";
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import type { PlanSummary } from "@travel-crm/contracts/subscriptions";
import { startWorker } from "@travel-crm/domain/jobs";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { afterAll, beforeAll, describe, expect, it, onTestFinished, vi } from "vitest";
import { startConsoleJobs } from "../src/console-jobs.js";
import { workerJobs } from "../src/worker-jobs.js";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import { createTestServer, postJson, signInByEmail, type TestServer } from "./support/test-server.js";
import { dataOf, mutate, query, refusalOf } from "./support/trpc.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const profile = {
  legalName: "Sahyadri Treks LLP",
  gstin: "27AAPFU0939F1ZV",
  gstStateCode: "27",
  address: "21 FC Road, Shivajinagar, Pune 411005",
  contactName: "Neha Joshi",
  contactPhone: "+91 98220 12345",
  bankAccountName: "Sahyadri Treks LLP",
  bankAccountNumber: "001234567890",
  bankIfsc: "HDFC0001234",
  bankName: "HDFC Bank",
  invoicePrefix: "ST",
};

const branding = { brandColour: "#2e6b3f", documentTerms: null };

// Every field the lifecycle reads, so the console's nightly advance (console-jobs.test.ts runs it over every
// organization in the shared database) can't leave a stale stored status behind between two steps.
function lapsedTrial(daysAgo: number) {
  return {
    status: "trial" as const,
    trialEndsOn: new Date(Date.now() - daysAgo * DAY_MS),
    paidThrough: null,
    statusChangedAt: new Date(Date.now() - 30 * DAY_MS),
  };
}

describe("an agency's life on the platform", () => {
  const email = createMemoryEmailSender();
  const consoleQueue = createMemoryJobQueue();
  const consoleRunner = createMemoryJobRunner(consoleQueue);
  // What the worker reports. A throwing log would only fail its own job (the runner retries it, then records it), so
  // lines are collected and the journey asserts there were none.
  const reported: string[] = [];
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server, { queue: consoleQueue });
    await startConsoleJobs(consoleRunner, testConsole.services, null);
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  /** Runs the worker until the invite has gone out, as the worker process would. */
  async function deliverInvite(organizationId: string, address: string): Promise<string> {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const worker = await startWorker({
      db: server.db,
      runner,
      queue,
      ...workerJobs({
        db: server.db,
        identity: server.identity,
        files: server.files,
        email,
        push: createMemoryPushSender(),
        appUrl: "https://app.example.in",
        webhookProviders: [],
        rateLimiter: createRateLimiter(server.db, { keySecret: "platform-journey-test-rate-limit-secret-of-32-bytes" }),
        log: (line) => reported.push(line),
      }),
      relay: { intervalMs: 20, organizationIds: [organizationId] },
    });
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        await runner.runQueued();
        const invite = email.sent.find((message) => message.to.address === address);
        const token = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(invite?.text ?? "")?.[1];
        if (token) return token;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error("the invite never went out");
    } finally {
      await worker.stop();
    }
  }

  it("onboards, bills, locks and purges an agency, each step where the spec puts it", async () => {
    const today = calendarDateIn(new Date(), "Asia/Kolkata");
    const code = `J${crypto.randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const ownerEmail = `neha-${code.toLowerCase()}@example.test`;

    // A super admin puts a plan on sale; support onboards the agency on a 14-day trial.
    const plan = await dataOf<PlanSummary>(
      await consoleMutate(
        testConsole,
        "plans.create",
        {
          key: `growth-${code.toLowerCase()}`,
          name: "Growth",
          monthlyPricePaise: 2_499_00,
          yearlyPricePaise: 24_990_00,
          seatLimit: 3,
          whatsappNumberLimit: 1,
          storageLimitBytes: 10_000_000_000,
          modules: ["crm", "quotes"],
        },
        superAdmin.jar,
      ),
    );
    const { organizationId } = await dataOf<OnboardedOrganization>(
      await consoleMutate(
        testConsole,
        "organizations.onboard",
        {
          name: "Sahyadri Treks",
          code,
          timeZone: "Asia/Kolkata",
          contactEmail: `hello-${code.toLowerCase()}@example.test`,
          profile: {
            legalName: profile.legalName,
            gstin: profile.gstin,
            gstStateCode: profile.gstStateCode,
            contactName: profile.contactName,
            contactPhone: profile.contactPhone,
          },
          owner: { name: "Neha Joshi", email: ownerEmail },
          subscription: {
            planId: plan.id,
            billingCycle: "monthly",
            trialEndsOn: addDays(today, 14),
            paidThrough: null,
          },
        },
        support.jar,
      ),
    );

    // The worker emails the invite; the Owner chooses a password from its link and signs in.
    const token = await deliverInvite(organizationId, ownerEmail);
    expect(
      (await postJson(server, "/api/auth/reset-password", { token, newPassword: "neha-chose-this-1" })).status,
    ).toBe(200);
    const owner = new CookieJar();
    expect((await signInByEmail(server, owner, ownerEmail, "neha-chose-this-1")).status).toBe(200);
    expect(await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).toMatchObject({
      status: "trial",
      planName: "Growth",
      trialEndsOn: addDays(today, 14),
      limits: { seats: 3 },
    });
    await dataOf(await mutate(server, "organization.profile.update", profile, owner));
    await dataOf(await mutate(server, "organization.branding.update", branding, owner));

    // Two days after the trial's end it is past due: nothing is withheld yet. The dates leave days of margin under any
    // policy another test file might briefly set (past due for 7 to 10 days), so no policy can change the answer.
    await server.platform.subscription.update({
      where: { organizationId },
      data: lapsedTrial(2),
    });
    expect((await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).status).toBe(
      "past_due",
    );
    await dataOf(await mutate(server, "organization.profile.update", profile, owner));

    // Thirteen days after it, it is read-only: the Owner may look, but not change anything.
    await server.platform.subscription.update({
      where: { organizationId },
      data: lapsedTrial(13),
    });
    expect((await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).status).toBe(
      "read_only",
    );
    expect((await query(server, "organization.profile.get", owner)).status).toBe(200);
    expect(await refusalOf(await mutate(server, "organization.profile.update", profile, owner))).toEqual({
      status: 403,
      reason: "ORGANIZATION_READ_ONLY",
    });

    // Support records the payment: active again, from the next request.
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.recordPayment",
        {
          organizationId,
          amountPaise: 2_499_00,
          paidOn: today,
          paidThrough: addDays(today, 30),
          reference: "NEFT UTR 412345678901",
        },
        support.jar,
      ),
    );
    expect((await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).status).toBe("active");
    await dataOf(
      await mutate(server, "organization.branding.update", { ...branding, documentTerms: "50% advance" }, owner),
    );

    // Leaving: export, cancel (the Owner can still see why), then the purge, which only a super admin asks for. The
    // export is the console's job, with its expiry, queued with it, which finds nothing due yet.
    await dataOf(
      await consoleMutate(testConsole, "dataProtection.exportOrganization", { organizationId }, superAdmin.jar),
    );
    expect(await consoleRunner.runQueued()).toBe(2);
    await dataOf(
      await consoleMutate(
        testConsole,
        "subscriptions.cancel",
        { organizationId, reason: "Closed the business" },
        support.jar,
      ),
    );
    expect((await dataOf<SubscriptionOverview>(await query(server, "subscription.get", owner))).status).toBe(
      "cancelled",
    );
    expect(await refusalOf(await query(server, "organization.profile.get", owner))).toEqual({
      status: 403,
      reason: "ORGANIZATION_CANCELLED",
    });
    await dataOf<QueuedJob>(
      await consoleMutate(
        testConsole,
        "dataProtection.requestPurge",
        { organizationId, confirmation: code },
        superAdmin.jar,
      ),
    );
    // The purge, then the deletions' follow-up run it queues for the second sweep of the organization's storage folder,
    // due once upload links handed out before the purge lapse. The memory runner ignores that start time, so it runs at
    // once, finds the sweep not yet due, and queues nothing more: its next run would have the same id.
    expect(await consoleRunner.runQueued()).toBe(2);
    expect(consoleRunner.failed).toEqual([]);
    expect(reported).toEqual([]);

    // Gone: the organization, its Owner and their sessions. The cookie cache may still vouch for the session for a
    // few minutes, but the membership is read from the database on every request. The platform log keeps what
    // happened, by id.
    expect(await server.platform.organization.count({ where: { id: organizationId } })).toBe(0);
    expect(await refusalOf(await query(server, "subscription.get", owner))).toEqual({
      status: 403,
      reason: "NOT_A_MEMBER",
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    onTestFinished(() => {
      warn.mockRestore();
    });
    expect((await signInByEmail(server, new CookieJar(), ownerEmail, "neha-chose-this-1")).status).toBe(401);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("User not found"));
    const log = await dataOf<PlatformLogPage>(
      await consoleQuery(testConsole, "log.list", superAdmin.jar, { targetOrganizationId: organizationId }),
    );
    expect(log.entries.map((entry) => entry.action)).toEqual([
      "organization.purged",
      "organization.purge-requested",
      // Support's cancellation and payment: billing changes, which the platform log keeps too (ADR 0020).
      "subscription.cancelled",
      "organization.exported",
      "organization.export-requested",
      "subscription.payment-recorded",
      "organization.onboarded",
    ]);
  });
});
