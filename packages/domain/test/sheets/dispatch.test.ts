// The dispatcher (S35, S36): one sheets.check job for each due sheet, ids only, the most overdue first, at most 50 an
// account a minute, a claimed sheet not queued again until its claim lapses, a held account skipped. It runs on a database
// of its own: the schedule is read across every organization, which other files' sheets would upset.
import { randomUUID } from "node:crypto";
import { createDatabase, type Database } from "@travel-crm/db";
import { createPlatformClient, type PlatformClient } from "@travel-crm/db/platform";
import { createIsolatedDatabase, createTestOrganization, type IsolatedDatabase } from "@travel-crm/db/testing";
import { createMemoryJobQueue, type MemoryJobQueue } from "@travel-crm/integrations/jobs";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import {
  createAccountHolds,
  dispatchDueChecks,
  maxReadsPerMinutePerAccount,
  SHEETS_CHECK_QUEUE,
  sheetsDispatchSchedule,
} from "../../src/sheets/index.js";
import { scheduleRowOf, upsertScheduleRow } from "../../src/sheets/schedule.js";

describe("the dispatcher", () => {
  let isolated: IsolatedDatabase;
  let platform: PlatformClient;
  let db: Database;
  let organizationId: string;
  const start = new Date("2026-10-19T10:00:00Z");
  const minutes = (n: number) => new Date(start.getTime() + n * 60_000);

  beforeAll(async () => {
    isolated = await createIsolatedDatabase(inject("dbUrls"));
    platform = createPlatformClient(isolated.urls.platform);
    db = createDatabase(isolated.urls.runtime, { maxConnections: 3 });
    organizationId = await createTestOrganization(platform, "Dispatch agency");
  }, 120_000);

  // Each test starts with an empty schedule: the dispatcher reads it across every organization.
  beforeEach(async () => {
    await platform.sheetCheckSchedule.deleteMany();
  });

  afterAll(async () => {
    await db.disconnect();
    await platform.$disconnect();
    await isolated.drop();
  });

  /** n sheets due `overdue` minutes before `start` on an account. */
  async function due(count: number, account = 0, overdue = 1) {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const sheetId = randomUUID();
      ids.push(sheetId);
      await upsertScheduleRow(db, {
        sheetId,
        organizationId,
        serviceAccountIndex: account,
        nextCheckAt: minutes(-overdue - index / 1000),
      });
    }
    return ids;
  }
  const dispatcher = (queue: MemoryJobQueue, accounts = 1, holds = createAccountHolds()) => ({
    db,
    queue,
    accounts,
    holds,
  });
  const queuedIds = (queue: MemoryJobQueue) => queue.sent.map((job) => job.data.sheetId);

  it("queues one sheets.check for each due sheet, ids only", async () => {
    const queue = createMemoryJobQueue();
    const [one, two] = await due(2, 0);
    const result = await dispatchDueChecks(dispatcher(queue, 1), start);
    expect(result).toMatchObject({ queued: 2, byAccount: { 0: 2 } });
    expect(queue.sent.map((job) => [job.queue, job.data])).toEqual(
      expect.arrayContaining([
        [SHEETS_CHECK_QUEUE, { sheetId: one, organizationId }],
        [SHEETS_CHECK_QUEUE, { sheetId: two, organizationId }],
      ]),
    );
    expect(queue.sent.every((job) => Object.keys(job.data).sort().join() === "organizationId,sheetId")).toBe(true);
    expect(queue.sent.every((job) => job.options.expireInSeconds === 3600)).toBe(true);
  });

  it("queues the most overdue first, and at most 50 per account per tick", async () => {
    const queue = createMemoryJobQueue();
    const ids = await due(120, 0);
    const counts: number[] = [];
    for (const tick of [0, 1, 2, 3]) {
      const before = queue.sent.length;
      await dispatchDueChecks(dispatcher(queue, 1), minutes(tick));
      counts.push(queue.sent.length - before);
    }
    expect(counts).toEqual([maxReadsPerMinutePerAccount, 50, 20, 0]);
    // The first fifty were the most overdue: due() makes later indexes more overdue.
    expect(queuedIds(queue).slice(0, 50)).toEqual(ids.toReversed().slice(0, 50));
    expect(new Set(queuedIds(queue)).size).toBe(120);
  });

  it("queues nothing for a sheet claimed under five minutes ago, and again once the claim lapses", async () => {
    const queue = createMemoryJobQueue();
    const [sheetId] = await due(1, 0);
    await dispatchDueChecks(dispatcher(queue, 1), start);
    expect(queuedIds(queue)).toEqual([sheetId]);
    await dispatchDueChecks(dispatcher(queue, 1), minutes(4));
    expect(queuedIds(queue)).toEqual([sheetId]);
    await dispatchDueChecks(dispatcher(queue, 1), minutes(6));
    expect(queuedIds(queue)).toEqual([sheetId, sheetId]);
    expect((await scheduleRowOf(db, sheetId ?? ""))?.claimedUntil).toEqual(minutes(11));
  });

  it("skips an account that is held until the hold ends, and carries on with the others", async () => {
    const queue = createMemoryJobQueue();
    const held = await due(2, 0);
    const free = await due(2, 1);
    const holds = createAccountHolds();
    holds.backOff(0, start, 120);
    await dispatchDueChecks(dispatcher(queue, 2, holds), start);
    expect(queuedIds(queue).sort()).toEqual([...free].sort());
    await dispatchDueChecks(dispatcher(queue, 2, holds), minutes(3));
    expect(
      queuedIds(queue)
        .filter((id) => held.includes(String(id)))
        .sort(),
    ).toEqual([...held].sort());
  });

  it("finds every sheet overdue after the worker slept, and queues them within the budget over the next ticks", async () => {
    const queue = createMemoryJobQueue();
    // An hour of ticks that never ran: 130 sheets on an account are all overdue by 60 minutes.
    const ids = await due(130, 0, 60);
    const perTick: number[] = [];
    for (const tick of [0, 1, 2, 3]) {
      const before = queue.sent.length;
      await dispatchDueChecks(dispatcher(queue, 1), minutes(tick));
      perTick.push(queue.sent.length - before);
    }
    expect(perTick).toEqual([50, 50, 30, 0]);
    expect(new Set(queuedIds(queue))).toEqual(new Set(ids));
  });

  it("keeps the interval at 120 seconds, and stretches it past the budget with no sheet starved", async () => {
    const queue = createMemoryJobQueue();
    const ids = await due(120, 0, 0);
    // The checks of the first tick finish and are due again two minutes later: every sheet is queued within three ticks.
    for (const tick of [0, 1, 2]) await dispatchDueChecks(dispatcher(queue, 1), minutes(tick));
    expect(new Set(queuedIds(queue))).toEqual(new Set(ids));
  });

  it("is a schedule every minute that queues what is due", async () => {
    const queue = createMemoryJobQueue();
    const schedule = sheetsDispatchSchedule(dispatcher(queue, 1));
    expect(schedule).toMatchObject({ queue: "sheets.dispatch-checks", cron: "* * * * *", timeZone: "Asia/Kolkata" });
    await due(1, 0, 5);
    await schedule.handle({});
    expect(queue.sent).toHaveLength(1);
  });
});
