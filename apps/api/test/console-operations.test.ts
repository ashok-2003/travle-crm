// The console's dashboard (spec 7.4) and failed-jobs list (spec 9.1) over HTTP: platform staff see every organization
// and every failed job; only a super admin removes a schedule.
import type { OrganizationOverview } from "@travel-crm/contracts/platform";
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

describe("the console's operations", () => {
  const jobs = createMemoryJobAdministration();
  let server: TestServer;
  let testConsole: TestConsole;
  let support: TestPlatformStaff;

  beforeAll(async () => {
    server = createTestServer();
    testConsole = createTestConsole(server, { jobs });
    support = await signedInPlatformStaff(server, "support");
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

  it("lists failed jobs and runs one again; only a super admin removes a schedule", async () => {
    jobs.failed.push({
      id: "0199e7a0-0000-7000-8000-0000000000e1",
      queue: "notifications.deliver",
      data: {},
      attempts: 6,
      failedAt: null,
      error: "Error: SMTP down",
    });
    jobs.scheduled.push({ queue: "rate-limits.purge", cron: "30 3 * * *", timeZone: "Asia/Kolkata" });
    expect(await dataOf(await consoleQuery(testConsole, "jobs.failed", support.jar, {}))).toEqual([
      expect.objectContaining({ queue: "notifications.deliver", error: "Error: SMTP down", failedAt: null }),
    ]);
    await dataOf(
      await consoleMutate(
        testConsole,
        "jobs.retry",
        { queue: "notifications.deliver", jobId: "0199e7a0-0000-7000-8000-0000000000e1" },
        support.jar,
      ),
    );
    expect(jobs.retried).toHaveLength(1);
    expect(
      await refusalOf(await consoleMutate(testConsole, "jobs.unschedule", { queue: "rate-limits.purge" }, support.jar)),
    ).toEqual({ status: 403, reason: "SUPER_ADMIN_ONLY" });
    expect(await dataOf(await consoleQuery(testConsole, "jobs.schedules", support.jar))).toHaveLength(1);
  });
});
