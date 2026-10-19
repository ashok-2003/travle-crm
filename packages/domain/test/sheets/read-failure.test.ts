// When Google does not hand the rows over (S37, S39, S40): a blip only counts, the third scheduled failure or any from a
// person's button is lost access, a 429 holds the account with no fault, a timeout leaves "Last checked" alone, a renamed
// tab is found by its gid and a tab whose gid is gone is a missing tab.
import { afterAll, describe, expect, it } from "vitest";
import { createAccountHolds } from "../../src/sheets/index.js";
import { answer, setup as setupSheet } from "./support/running.js";
import { createTestSheets } from "./support/sheets.js";
import { freshPhone } from "../crm/support/records.js";

const test = createTestSheets();
afterAll(() => test.close());
const setup = () => setupSheet(test);
const later = (minutes: number) => () => new Date(Date.now() + minutes * 60_000);

describe("a read that fails", () => {
  it("counts a first and second scheduled 403 without alarming, and enters lost_access on the third", async () => {
    const lost = await setup();
    for (const failures of [1, 2]) {
      test.google.failNext("not_shared");
      expect(await lost.check("scheduled", {}, later(failures * 10))).toMatchObject({
        result: "failed",
        keepSchedule: true,
      });
      expect(await lost.state()).toMatchObject({
        status: "running",
        consecutiveFailures: failures,
        checkStartedAt: null,
      });
    }
    expect(await lost.inOrg<number>((tx) => tx.outboxEvent.count({ where: { type: "sheet.attention" } }))).toBe(0);
    test.google.failNext("not_shared");
    await lost.check("scheduled", {}, later(30));
    const state = await lost.state();
    expect(state).toMatchObject({ status: "lost_access", consecutiveFailures: 3 });
    expect(state.attentionSince).not.toBeNull();
    expect(await lost.inOrg<number>((tx) => tx.outboxEvent.count({ where: { type: "sheet.attention" } }))).toBe(1);
    // Failing again, in the same state, tells nobody more.
    for (const minutes of [40, 50]) {
      test.google.failNext("not_found");
      await lost.check("scheduled", {}, later(minutes));
    }
    expect(await lost.inOrg<number>((tx) => tx.outboxEvent.count({ where: { type: "sheet.attention" } }))).toBe(1);
  });

  it("enters lost_access at once on a failure from Sync now or Check again", async () => {
    for (const mode of ["sync-now", "recheck"] as const) {
      const button = await setup();
      test.google.failNext("not_shared");
      await button.check(mode);
      expect((await button.state()).status, mode).toBe("lost_access");
    }
  });

  it("holds the account for Retry-After on a 429, 60 seconds when absent, doubling to 10 minutes while it keeps happening, with no fault and no state change", async () => {
    const limited = await setup();
    const holds = createAccountHolds();
    // Retry-After 120 once; then none, so 60 seconds doubling with each repeat, to ten minutes.
    const sequence: [number | null, number][] = [
      [120, 120],
      [null, 120],
      [null, 240],
      [null, 480],
      [null, 600],
      [null, 600],
    ];
    let minutes = 0;
    for (const [retryAfterSeconds, held] of sequence) {
      minutes += 20;
      const now = later(minutes)();
      test.google.failNext("rate_limited", retryAfterSeconds === null ? {} : { retryAfterSeconds });
      const outcome = await limited.check("scheduled", { holds }, () => now);
      expect(outcome).toMatchObject({ result: "failed", nextCheckInSeconds: held, keepSchedule: true });
      expect(holds.isHeld(0, new Date(now.getTime() + (held - 1) * 1000))).toBe(true);
      expect(holds.isHeld(0, new Date(now.getTime() + (held + 1) * 1000))).toBe(false);
    }
    expect(await limited.state()).toMatchObject({ status: "running", consecutiveFailures: 0, checkStartedAt: null });
    expect((await limited.state()).holdUntil).not.toBeNull();
  });

  it("keeps Last checked at the last good time on a timeout, a 5xx or a network error", async () => {
    const blip = await setup();
    await blip.check();
    const good = (await blip.state()).lastCheckedAt;
    expect(good).not.toBeNull();
    for (const [index] of [0, 1, 2].entries()) {
      test.google.failNext("unavailable");
      expect(await blip.check("scheduled", {}, later(10 * (index + 1)))).toMatchObject({
        result: "failed",
        nextCheckInSeconds: 120,
      });
    }
    expect(await blip.state()).toMatchObject({
      status: "running",
      consecutiveFailures: 0,
      lastCheckedAt: good,
      checkStartedAt: null,
    });
  });

  it("finds a renamed tab by its gid and carries on, and enters tab_missing when the gid is gone", async () => {
    const renamed = await setup();
    test.google.renameTab(renamed.sheet.spreadsheetId, "0", "Responses");
    test.google.append(renamed.sheet.spreadsheetId, "Responses", answer("Asha", freshPhone()));
    await renamed.check();
    expect(await renamed.state()).toMatchObject({ status: "running", tabTitle: "Responses" });
    expect(await renamed.leads()).toHaveLength(1);

    const gone = await setup();
    const id = gone.sheet.spreadsheetId;
    test.google.deleteSpreadsheet(id);
    test.google.addSpreadsheet({ id, title: "Goa", tabs: [{ gid: "9", title: "Another", rows: [["Name"]] }] });
    test.google.share(id, test.accountEmail);
    await gone.check();
    const state = await gone.state();
    expect(state.status).toBe("tab_missing");
    expect(state.attentionSince).not.toBeNull();
    expect(await gone.inOrg<number>((tx) => tx.outboxEvent.count({ where: { type: "sheet.attention" } }))).toBe(1);
  });
});
