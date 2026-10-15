// The console's dashboard (spec 7.4) and failed-jobs list (spec 9.1) over HTTP: platform staff see every organization
// and every failed job, a page at a time; support runs a failed job again, but nobody retries the platform's purge,
// erasure or export; only a super admin removes a schedule.
import type { FailedJobsPage, OrganizationOverview } from "@travel-crm/contracts/platform";
import { ERASE_SUBJECT_QUEUE, EXPORT_ORGANIZATION_QUEUE, PURGE_ORGANIZATION_QUEUE } from "@travel-crm/domain/platform";
import { createMemoryJobAdministration } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  consoleMutate,
  consoleQuery,
  createTestConsole,
  signedInPlatformStaff,
  type TestConsole,
  type TestPlatformStaff,
} from "./support/console.js";
import { createTestAgency, createTestServer, type TestServer } from "./support/test-server.js";
import { dataOf, refusalOf } from "./support/trpc.js";

const jobId = (n: number) => `0199e7a0-0000-7000-8000-${String(n).padStart(12, "0")}`;

describe("the console's operations", () => {
  const jobs = createMemoryJobAdministration();
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;
  let superAdmin: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server, { jobs });
    support = await signedInPlatformStaff(server, "support");
    superAdmin = await signedInPlatformStaff(server, "super-admin");
  });

  afterAll(async () => {
    await testConsole.close();
    await server.close();
  });

  it("shows every organization on the dashboard, with its plan and seats", async () => {
    const agency = await createTestAgency(server);
    const overviews = await dataOf<OrganizationOverview[]>(
      await consoleQuery(testConsole, "dashboard.organizations", support.jar),
    );
    expect(overviews.find((overview) => overview.organizationId === agency.organizationId)).toMatchObject({
      code: agency.code,
      status: "active",
      planName: "Everything (tests)",
      seats: { used: 1, limit: 1000 },
    });
  });

  it("lists failed jobs a page at a time and runs one again; only a super admin removes a schedule", async () => {
    for (const [n, minutesAgo] of [
      [1, 3],
      [2, 2],
      [3, 1],
    ] as const) {
      jobs.failed.push({
        id: jobId(n),
        queue: "notifications.deliver",
        data: {},
        attempts: 6,
        failedAt: new Date(Date.now() - minutesAgo * 60_000),
        error: "Error: SMTP down",
      });
    }
    jobs.scheduled.push({ queue: "rate-limits.purge", cron: "30 3 * * *", timeZone: "Asia/Kolkata" });
    const page = (input: unknown) =>
      consoleQuery(testConsole, "jobs.failed", support.jar, input).then((response) => dataOf<FailedJobsPage>(response));
    const first = await page({ limit: 2 });
    expect(first.jobs.map((job) => job.id)).toEqual([jobId(3), jobId(2)]);
    expect(first.jobs[0]).toMatchObject({ queue: "notifications.deliver", error: "Error: SMTP down" });
    expect(await page({ limit: 2, after: first.nextCursor })).toEqual({
      jobs: [expect.objectContaining({ id: jobId(1) })],
      nextCursor: null,
    });

    const retry = (queue: string, id: string) =>
      consoleMutate(testConsole, "jobs.retry", { queue, jobId: id }, support.jar);
    await dataOf(await retry("notifications.deliver", jobId(1)));
    expect(jobs.retried).toEqual([{ queue: "notifications.deliver", jobId: jobId(1) }]);
    // Not there any more: a 404, not a second retry. A queue name that can't be one is refused before anything runs.
    expect(await refusalOf(await retry("notifications.deliver", jobId(1)))).toEqual({
      status: 404,
      reason: "FAILED_JOB_NOT_FOUND",
    });
    expect((await retry("No Such", jobId(1))).status).toBe(400);
    expect(
      await refusalOf(await consoleMutate(testConsole, "jobs.unschedule", { queue: "rate-limits.purge" }, support.jar)),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(await dataOf(await consoleQuery(testConsole, "jobs.schedules", support.jar))).toHaveLength(1);
  });

  it("refuses support and super admins alike a retry of a purge, an erasure or an export", async () => {
    const queues = [PURGE_ORGANIZATION_QUEUE, ERASE_SUBJECT_QUEUE, EXPORT_ORGANIZATION_QUEUE];
    queues.forEach((queue, index) =>
      jobs.failed.push({ id: jobId(800 + index), queue, data: {}, attempts: 6, failedAt: null, error: "Error" }),
    );
    for (const staff of [support, superAdmin]) {
      for (const [index, queue] of queues.entries()) {
        const response = await consoleMutate(
          testConsole,
          "jobs.retry",
          { queue, jobId: jobId(800 + index) },
          staff.jar,
        );
        expect(await refusalOf(response), queue).toEqual({ status: 409, reason: "NOT_RETRYABLE" });
      }
    }
    expect(jobs.retried.filter((job) => queues.includes(job.queue))).toEqual([]);
  });
});
