// The console process's jobs (ADR 0018): the platform's purge and erasure jobs, the nightly subscription lifecycle at
// 00:15 India time, as the platform role, and, when a demo is set, the nightly demo reset at 02:00; with the demo
// switched off, the schedule an earlier start left in pg-boss goes.
import { randomUUID } from "node:crypto";
import { PURGE_ORGANIZATION_QUEUE, RESET_DEMO_QUEUE } from "@travel-crm/domain/platform";
import { ADVANCE_SUBSCRIPTIONS_QUEUE } from "@travel-crm/domain/subscriptions";
import { createMemoryJobQueue, createMemoryJobRunner } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startConsoleJobs } from "../src/console-jobs.js";
import { createTestConsole, type TestConsole } from "./support/console.js";
import { createTestAgency, createTestServer, EVERYTHING_PLAN_KEY, type TestServer } from "./support/test-server.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const lifecycleSchedule = {
  queue: ADVANCE_SUBSCRIPTIONS_QUEUE,
  cron: "15 0 * * *",
  timeZone: "Asia/Kolkata",
  data: {},
};

describe("the console's jobs", () => {
  let server: TestServer;
  let testConsole: TestConsole;

  beforeAll(() => {
    server = createTestServer();
    testConsole = createTestConsole(server);
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("runs the platform's jobs, and resets the demo every night at 02:00 India time", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    // The first test agency puts the test plan on sale.
    await createTestAgency(server);
    const demo = {
      code: `D${randomUUID().slice(0, 8).toUpperCase()}`,
      planKey: EVERYTHING_PLAN_KEY,
      password: "demo-password-123",
    };
    await startConsoleJobs(runner, testConsole.services, demo);
    expect(runner.schedules).toEqual([
      lifecycleSchedule,
      { queue: RESET_DEMO_QUEUE, cron: "0 2 * * *", timeZone: "Asia/Kolkata", data: {} },
    ]);

    await runner.fireSchedule(RESET_DEMO_QUEUE);
    // A purge of an organization already gone does nothing, and fails nothing.
    await queue.send(PURGE_ORGANIZATION_QUEUE, { organizationId: randomUUID(), requestedBy: null });
    expect(await runner.runQueued()).toBe(2);
    expect(runner.failed).toEqual([]);
    expect(await server.platform.organization.count({ where: { code: demo.code } })).toBe(1);
  });

  it("removes the demo's schedule when the demo is switched off", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
    await runner.schedule(RESET_DEMO_QUEUE, "0 2 * * *", { timeZone: "Asia/Kolkata" });
    await startConsoleJobs(runner, testConsole.services, null);
    expect(runner.schedules).toEqual([lifecycleSchedule]);
  });

  it("records a lapsed trial as past due every night, as the platform role", async () => {
    const queue = createMemoryJobQueue();
    const runner = createMemoryJobRunner(queue);
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
    await startConsoleJobs(runner, testConsole.services, null);
    await runner.fireSchedule(ADVANCE_SUBSCRIPTIONS_QUEUE);
    expect(await runner.runQueued()).toBe(1);
    expect(runner.failed).toEqual([]);
    const subscription = await server.platform.subscription.findUniqueOrThrow({
      where: { organizationId: agency.organizationId },
    });
    expect(subscription.status).toBe("past_due");
    expect(
      await server.platform.auditEntry.findFirst({
        where: { organizationId: agency.organizationId, action: "subscription.status-changed" },
      }),
    ).toMatchObject({ source: "job", before: { status: "trial" }, after: { status: "past_due" } });
  });
});
