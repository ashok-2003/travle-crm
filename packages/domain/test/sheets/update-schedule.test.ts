// The check schedule (S36, spec 5): a row for a sheet that is checked, none for one that is not, the same when run twice;
// the dispatcher's claim takes the most overdue first, skips what is claimed and what is another account's, and holds
// what it takes for five minutes.
import { afterAll, describe, expect, it } from "vitest";
import {
  claimDueSheets,
  finishScheduledCheck,
  removeScheduleRow,
  scheduleRowOf,
  upsertScheduleRow,
} from "../../src/sheets/schedule.js";
import { hasScheduleRow, scheduleListener } from "../../src/sheets/index.js";
import { newUuidV7 } from "../../src/kernel/index.js";
import { aSheet, anAgency, createTestSheets, memberOf, runListener } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const statuses = [
  "connecting",
  "running",
  "paused",
  "lost_access",
  "tab_missing",
  "columns_missing",
  "needs_manager",
  "disconnected",
] as const;

async function sheetIn(status: string) {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const sheet = await test.db.forOrg(agency, (tx) =>
    aSheet(tx, { connectedBy: importer.userId, status, serviceAccountIndex: 0 }),
  );
  return { agency, sheetId: sheet.id };
}
const changed = (agency: string, sheetId: string) =>
  runListener(test, scheduleListener({ db: test.db }), agency, {
    type: "sheet.schedule-changed",
    payload: { sheetId },
  });

describe("the schedule listener", () => {
  it("writes a schedule row for running, lost_access, tab_missing, columns_missing and needs_manager, and none for connecting, paused and disconnected", async () => {
    for (const status of statuses) {
      const { agency, sheetId } = await sheetIn(status);
      await changed(agency, sheetId);
      const row = await scheduleRowOf(test.db, sheetId);
      expect(row !== null, status).toBe(hasScheduleRow(status));
      if (row !== null) {
        expect(row).toMatchObject({ organizationId: agency, serviceAccountIndex: 0, claimedUntil: null });
      }
    }
  });

  it("gives the same row when run twice, keeps a row's time, and removes it when the sheet is paused, disconnected or gone", async () => {
    const { agency, sheetId } = await sheetIn("running");
    await changed(agency, sheetId);
    const first = await scheduleRowOf(test.db, sheetId);
    await new Promise((resolve) => setTimeout(resolve, 15));
    await changed(agency, sheetId);
    expect(await scheduleRowOf(test.db, sheetId)).toEqual(first);
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.update({ where: { id: sheetId }, data: { status: "paused" } }),
    );
    await changed(agency, sheetId);
    expect(await scheduleRowOf(test.db, sheetId)).toBeNull();
    // A sheet that is gone has nothing to schedule, and removing a row that isn't there is harmless.
    await changed(agency, newUuidV7());
    await removeScheduleRow(test.db, { sheetId, organizationId: agency });
  });
});

describe("claimDueSheets", () => {
  const due = async (organizationId: string, nextCheckAt: Date, serviceAccountIndex = 0) => {
    const sheetId = newUuidV7();
    await upsertScheduleRow(test.db, { sheetId, organizationId, serviceAccountIndex, nextCheckAt });
    return sheetId;
  };
  const now = new Date("2026-10-19T10:00:00Z");
  const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

  it("claims the most overdue first, skips a claimed row and another account's, and holds the claim for five minutes", async () => {
    const agency = await anAgency(test, "Dispatch agency");
    const oldest = await due(agency, minutes(-30));
    const middle = await due(agency, minutes(-10));
    const newest = await due(agency, minutes(-1));
    const future = await due(agency, minutes(5));
    const otherAccount = await due(agency, minutes(-20), 1);
    const claimed = await claimDueSheets(test.db, { now, accountIndex: 0, limit: 2, claimSeconds: 300 });
    const mine = claimed.filter((row) => [oldest, middle, newest, future].includes(row.sheetId));
    expect(mine.map((row) => row.sheetId)).toEqual([oldest, middle]);
    expect(mine[0]?.organizationId).toBe(agency);
    expect((await scheduleRowOf(test.db, oldest))?.claimedUntil).toEqual(minutes(5));
    // A second claim a minute later finds the claimed ones held, and takes the next.
    const second = await claimDueSheets(test.db, { now: minutes(1), accountIndex: 0, limit: 10, claimSeconds: 300 });
    const rest = second
      .map((row) => row.sheetId)
      .filter((id) => [oldest, middle, newest, future, otherAccount].includes(id));
    expect(rest).toEqual([newest]);
    // After the claim lapses the first is claimable again; a future row never is; another account's is its own.
    const later = await claimDueSheets(test.db, { now: minutes(6), accountIndex: 0, limit: 10, claimSeconds: 300 });
    expect(later.map((row) => row.sheetId)).toEqual(expect.arrayContaining([oldest, middle]));
    expect(later.map((row) => row.sheetId)).not.toContain(otherAccount);
    const other = await claimDueSheets(test.db, { now, accountIndex: 1, limit: 10, claimSeconds: 300 });
    expect(other.map((row) => row.sheetId)).toContain(otherAccount);
  });

  it("gives two claimers disjoint sets", async () => {
    const agency = await anAgency(test, "Racing dispatchers");
    const ids = await Promise.all(Array.from({ length: 12 }, (_, index) => due(agency, minutes(-index - 1), 2)));
    const [a, b] = await Promise.all([
      claimDueSheets(test.db, { now, accountIndex: 2, limit: 12, claimSeconds: 300 }),
      claimDueSheets(test.db, { now, accountIndex: 2, limit: 12, claimSeconds: 300 }),
    ]);
    const taken = [...a, ...b].map((row) => row.sheetId);
    expect(new Set(taken).size).toBe(taken.length);
    expect(taken.sort()).toEqual([...ids].sort());
  });

  it("sets the next time and releases the claim when a check ends, or removes the row", async () => {
    const agency = await anAgency(test, "Finishing agency");
    const sheetId = await due(agency, minutes(-1), 3);
    await claimDueSheets(test.db, { now, accountIndex: 3, limit: 5, claimSeconds: 300 });
    await finishScheduledCheck(test.db, { sheetId, organizationId: agency, nextCheckAt: minutes(2) });
    expect(await scheduleRowOf(test.db, sheetId)).toMatchObject({ nextCheckAt: minutes(2), claimedUntil: null });
    // Another organization's name does not reach this row, to finish it or to remove it.
    const other = await anAgency(test, "Other finishing agency");
    await finishScheduledCheck(test.db, { sheetId, organizationId: other, nextCheckAt: null });
    await removeScheduleRow(test.db, { sheetId, organizationId: other });
    expect(await scheduleRowOf(test.db, sheetId)).toMatchObject({ nextCheckAt: minutes(2) });
    await finishScheduledCheck(test.db, { sheetId, organizationId: agency, nextCheckAt: null });
    expect(await scheduleRowOf(test.db, sheetId)).toBeNull();
  });

  it("sets a new connection's first check at a random moment within the first interval, and never earlier than now", async () => {
    for (const [random, low, high] of [
      [0, 0, 1_000],
      [0.5, 449_000, 451_000],
      [0.999, 898_000, 900_000],
    ] as const) {
      const { agency, sheetId } = await sheetIn("running");
      const before = Date.now();
      await runListener(
        test,
        scheduleListener({ db: test.db, checkIntervalSeconds: 900, random: () => random }),
        agency,
        { type: "sheet.schedule-changed", payload: { sheetId } },
      );
      const row = await scheduleRowOf(test.db, sheetId);
      const wait = (row?.nextCheckAt.getTime() ?? 0) - before;
      expect(wait).toBeGreaterThanOrEqual(low - 1_000);
      expect(wait).toBeLessThanOrEqual(high + 5_000);
    }
  });
});
