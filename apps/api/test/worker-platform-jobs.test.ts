// The worker's job for onboarding: it emails the invite the console's onboarding asked for, whose link lets the new
// Owner choose a password and sign in (spec 7.1), and runs no subscription job (the console process records the
// lifecycle, as the platform role: console-jobs.test.ts). In-memory runner and email.
import type { OnboardOrganizationInput } from "@travel-crm/contracts/platform";
import { startWorker } from "@travel-crm/domain/jobs";
import { addDays, calendarDateIn } from "@travel-crm/domain/kernel";
import { onboardOrganization } from "@travel-crm/domain/platform";
import { createRateLimiter } from "@travel-crm/domain/rate-limits";
import { ADVANCE_SUBSCRIPTIONS_QUEUE } from "@travel-crm/domain/subscriptions";
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

describe("the worker's invite job", () => {
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
      spreadsheets: server.spreadsheets,
      subscriptions: server.subscriptions,
      seatLimit: server.seatLimit,
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

  it("leaves the subscription lifecycle to the console process", () => {
    expect(work.schedules.map((schedule) => schedule.queue)).not.toContain(ADVANCE_SUBSCRIPTIONS_QUEUE);
    expect(work.handlers.map((handler) => handler.queue)).not.toContain(ADVANCE_SUBSCRIPTIONS_QUEUE);
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
      // A month's trial from today in India, the agency's zone.
      subscription: {
        planId: plan.id,
        billingCycle: "monthly",
        trialEndsOn: addDays(calendarDateIn(new Date(), "Asia/Kolkata"), 30),
        paidThrough: null,
      },
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
    expect(reported).toEqual([]);
  });
});
