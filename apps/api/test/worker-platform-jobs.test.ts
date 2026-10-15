// The worker's jobs for subscriptions and onboarding: just after midnight in India it records each organization's
// subscription as far as its unpaid days have taken it (spec 7.3), and it emails the invite the console's onboarding
// asked for, whose link lets the new Owner choose a password and sign in (spec 7.1). In-memory runner and email.
import type { OnboardOrganizationInput } from "@travel-crm/contracts/platform";
import { startWorker } from "@travel-crm/domain/jobs";
import { onboardOrganization } from "@travel-crm/domain/platform";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { createMemoryEmailSender } from "@travel-crm/integrations/email";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { createMemoryPushSender } from "@travel-crm/integrations/push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { workerJobs, type WorkerJobs } from "../src/worker-jobs.js";
import { createTestConsole, type TestConsole } from "./support/console.js";
import { CookieJar } from "./support/cookie-jar.js";
import {
  createTestAgency,
  createTestServer,
  EVERYTHING_PLAN_KEY,
  postJson,
  signInByEmail,
  type TestServer,
} from "./support/test-server.js";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("the worker's subscription and invite jobs", () => {
  const reported: string[] = [];
  const email = createMemoryEmailSender();
  let server: TestServer;
  let testConsole: TestConsole;
  let work: WorkerJobs;

  beforeAll(() => {
    server = createTestServer();
    testConsole = createTestConsole(server);
    work = workerJobs({
      db: server.db,
      identity: server.identity,
      files: server.files,
      email,
      push: createMemoryPushSender(),
      appUrl: "https://app.example.in",
      webhookProviders: [],
      rateLimiter: createRateLimiter(server.db, {
        keySecret: "worker-platform-jobs-test-rate-limit-secret-of-32-bytes",
      }),
      log: (line) => reported.push(line),
    });
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("records a lapsed trial as past due, every night just after midnight in India", async () => {
    const agency = await createTestAgency(server);
    // Two days ago in UTC is at least yesterday in India, whatever the hour.
    await server.platform.subscription.update({
      where: { organizationId: agency.organizationId },
      data: {
        status: "trial",
        trialEndsOn: new Date(Date.now() - 2 * DAY_MS),
        paidThrough: null,
        statusChangedAt: new Date(Date.now() - 30 * DAY_MS),
      },
    });
    const lifecycle = work.schedules.find((schedule) => schedule.queue === "subscriptions.advance-lifecycle");
    expect(lifecycle).toMatchObject({ cron: "15 0 * * *", timeZone: "Asia/Kolkata" });
    await lifecycle?.handle({});
    const subscription = await server.platform.subscription.findUniqueOrThrow({
      where: { organizationId: agency.organizationId },
    });
    expect(subscription.status).toBe("past_due");
    expect(reported).toEqual([]);
  });

  it("emails the Owner the console onboarded, whose link lets them choose a password and sign in", async () => {
    // The first test agency puts the test plan on sale.
    await createTestAgency(server);
    const plan = await server.platform.plan.findUniqueOrThrow({ where: { key: EVERYTHING_PLAN_KEY } });
    const code = `W${crypto.randomUUID().replaceAll("-", "").slice(0, 9).toUpperCase()}`;
    const ownerEmail = `owner-${code.toLowerCase()}@example.test`;
    const input: OnboardOrganizationInput = {
      name: "Coorg Getaways",
      code,
      timeZone: "Asia/Kolkata",
      contactEmail: `hello-${code.toLowerCase()}@example.test`,
      profile: {
        legalName: "Coorg Getaways LLP",
        gstin: null,
        gstStateCode: "29",
        contactName: null,
        contactPhone: null,
      },
      owner: { name: "Kavya Rao", email: ownerEmail },
      subscription: { planId: plan.id, billingCycle: "monthly", trialEndsOn: "2099-01-31", paidThrough: null },
    };
    const { organizationId } = await onboardOrganization(testConsole.services, { userId: crypto.randomUUID() }, input);

    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    const worker = await startWorker({
      db: server.db,
      runner,
      queue,
      ...work,
      relay: { intervalMs: 20, organizationIds: [organizationId] },
    });
    try {
      for (let attempt = 0; attempt < 100 && email.sent.length === 0; attempt += 1) {
        await runner.runQueued();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      await worker.stop();
    }
    const invite = email.sent.find((message) => message.to.address === ownerEmail);
    expect(invite?.subject).toBe("Your account for Coorg Getaways");
    const token = /\/reset-password\?token=([A-Za-z0-9_-]+)/.exec(invite?.text ?? "")?.[1] ?? "";
    expect(token).not.toBe("");

    const chosen = await postJson(server, "/api/auth/reset-password", { token, newPassword: "kavya-chose-this-1" });
    expect(chosen.status).toBe(200);
    expect((await signInByEmail(server, new CookieJar(), ownerEmail, "kavya-chose-this-1")).status).toBe(200);
  });
});
