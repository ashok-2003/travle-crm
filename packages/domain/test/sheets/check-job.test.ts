// The check job (S2, S19): it runs a check and sets the next time, removes the schedule row of a sheet that no longer needs
// one, refuses data that is not two ids, and carries no title, link or cell in its data or its errors.
import { afterAll, describe, expect, it } from "vitest";
import { sheetsCheckHandler } from "../../src/crm/index.js";
import { setup as setupSheet } from "./support/running.js";
import { upsertScheduleRow, scheduleRowOf } from "../../src/sheets/schedule.js";
import { checkDependencies, createTestSheets } from "./support/sheets.js";
import { answer } from "./support/running.js";
import { freshPhone } from "../crm/support/records.js";
import { SHEETS_CHECK_QUEUE } from "../../src/sheets/index.js";

const test = createTestSheets();
afterAll(() => test.close());

describe("sheetsCheckHandler", () => {
  it("runs a check and sets the next time 120 seconds on, clearing the claim", async () => {
    const running = await setupSheet(test);
    running.append(answer("Asha", freshPhone()));
    await upsertScheduleRow(test.db, {
      sheetId: running.sheet.sheetId,
      organizationId: running.agency,
      serviceAccountIndex: 0,
      nextCheckAt: new Date(Date.now() - 1000),
    });
    const handler = sheetsCheckHandler(running.dependencies());
    expect(handler).toMatchObject({ queue: SHEETS_CHECK_QUEUE, concurrency: 4 });
    const before = Date.now();
    await handler.handle({ sheetId: running.sheet.sheetId, organizationId: running.agency });
    expect(await running.leads()).toHaveLength(1);
    const row = await scheduleRowOf(test.db, running.sheet.sheetId);
    expect(row?.claimedUntil).toBeNull();
    expect(row?.nextCheckAt.getTime()).toBeGreaterThanOrEqual(before + 119_000);
    expect(row?.nextCheckAt.getTime()).toBeLessThanOrEqual(Date.now() + 121_000);
  });

  it("removes the schedule row when the sheet is disconnected, paused or gone", async () => {
    for (const status of ["disconnected", "paused"]) {
      const leaving = await setupSheet(test);
      await leaving.inOrg((tx) =>
        tx.sheetConnection.update({ where: { id: leaving.sheet.sheetId }, data: { status } }),
      );
      await upsertScheduleRow(test.db, {
        sheetId: leaving.sheet.sheetId,
        organizationId: leaving.agency,
        serviceAccountIndex: 0,
        nextCheckAt: new Date(),
      });
      await sheetsCheckHandler(leaving.dependencies()).handle({
        sheetId: leaving.sheet.sheetId,
        organizationId: leaving.agency,
      });
      expect(await scheduleRowOf(test.db, leaving.sheet.sheetId), status).toBeNull();
    }
    const gone = await setupSheet(test);
    const missing = "0199e7a0-0000-7000-8000-0000000000ee";
    await upsertScheduleRow(test.db, {
      sheetId: missing,
      organizationId: gone.agency,
      serviceAccountIndex: 0,
      nextCheckAt: new Date(),
    });
    await sheetsCheckHandler(gone.dependencies()).handle({ sheetId: missing, organizationId: gone.agency });
    expect(await scheduleRowOf(test.db, missing)).toBeNull();
  });

  it("rejects job data that is not two UUIDs without reading anything", async () => {
    const handler = sheetsCheckHandler(checkDependencies(test));
    const calls = test.google.calls.total;
    for (const data of [
      {},
      { sheetId: "x", organizationId: "y" },
      { sheetId: 5, organizationId: 6 },
      { sheetId: "0199e7a0-0000-7000-8000-0000000000ee" },
    ]) {
      await expect(handler.handle(data as never)).rejects.toThrow(
        "A sheet check job needs a sheetId and an organizationId",
      );
    }
    expect(test.google.calls.total).toBe(calls);
  });

  it("puts no title, link or cell in the job's data or in the error of a failed one", async () => {
    const failing = await setupSheet(test);
    const secret = "Priya Unmistakable";
    failing.append(["19/10/2026 14:00:00", secret, "+919876500077", ""]);
    const broken = {
      ...failing.dependencies(),
      db: { ...test.db, forOrg: () => Promise.reject(new Error(`boom ${secret}`)) },
    };
    const data = { sheetId: failing.sheet.sheetId, organizationId: failing.agency };
    expect(JSON.stringify(data)).not.toContain(secret);
    const error = await sheetsCheckHandler(broken as never)
      .handle(data)
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    // The job's error reaches pg-boss cut down: names and codes only, never this message (sanitizeJobError).
    const { sanitizeJobError } = await import("@travel-crm/integrations/jobs");
    expect(sanitizeJobError(error).message).not.toContain(secret);
  });
});
