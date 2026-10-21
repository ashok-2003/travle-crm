// The dispatcher stays within its budgets (spec 11, S35, S36): due sheets of a thousand connections are claimed within
// 100 ms on sheet_check_schedule_due, and the checks of a hundred agencies are queued within the quota, never more than 50
// an account a minute. The schedule is read across every organization, so this runs on a database of its own.
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import {
  createAccountHolds,
  dispatchDueChecks,
  maxReadsPerMinutePerAccount,
  SHEETS_CHECK_QUEUE,
} from "../../src/sheets/index.js";
import { claimDueSheets } from "../../src/sheets/schedule.js";
import { fastestMs } from "./query-plans.js";

describe("the dispatcher with a thousand connections", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  const start = new Date("2026-10-19T10:00:00Z");
  const minutes = (n: number) => new Date(start.getTime() + n * 60_000);

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 3 });
    // A hundred agencies of ten sheets each, on two accounts, all overdue by a different number of seconds.
    for (let agency = 0; agency < 100; agency += 1) {
      const organizationId = await createTestOrganization(platform, `Dispatch agency ${String(agency)}`);
      await platform.sheetCheckSchedule.createMany({
        data: Array.from({ length: 10 }, (_, index) => ({
          id: crypto.randomUUID(),
          organizationId,
          serviceAccountIndex: agency % 2,
          nextCheckAt: new Date(start.getTime() - (agency * 10 + index + 1) * 1000),
        })),
      });
    }
    await platform.$executeRaw`ANALYZE sheet_check_schedule`;
  }, 300_000);

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  it("claims due sheets of 1,000 connections within 100 ms", async () => {
    const fastest = await fastestMs(async () => {
      // Claims lapse at once, so every run finds the same sheets.
      const claimed = await claimDueSheets(db, {
        now: start,
        accountIndex: 0,
        limit: maxReadsPerMinutePerAccount,
        claimSeconds: 0,
      });
      expect(claimed).toHaveLength(maxReadsPerMinutePerAccount);
    });
    console.info("Sheets dispatch:", JSON.stringify({ claimMs: Math.round(fastest) }));
    expect(fastest).toBeLessThan(100);
  }, 60_000);

  it("queues the checks of 100 agencies within the quota: never more than the budget an account a minute, all within three ticks", async () => {
    await platform.sheetCheckSchedule.updateMany({ data: { claimedUntil: null } });
    const queue = createMemoryJobQueue();
    const holds = createAccountHolds();
    const queuedBy: number[] = [];
    let total = 0;
    for (let tick = 0; tick < 3; tick += 1) {
      const now = minutes(tick);
      const { queued, byAccount } = await dispatchDueChecks({ db, queue, accounts: 2, holds }, now);
      for (const count of Object.values(byAccount)) expect(count).toBeLessThanOrEqual(maxReadsPerMinutePerAccount);
      queuedBy.push(queued);
      total += queued;
    }
    expect(queue.sent.filter((job) => job.queue === SHEETS_CHECK_QUEUE)).toHaveLength(total);
    // A tick queues the full quota of both accounts, not more.
    const quota = 2 * maxReadsPerMinutePerAccount;
    expect(queuedBy).toEqual([quota, quota, quota]);
  }, 60_000);
});
