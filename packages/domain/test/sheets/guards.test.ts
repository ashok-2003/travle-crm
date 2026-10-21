// The AddGuard of imports' Add (B29): refused with IMPORT_ALREADY_RUNNING while a sheet's check of the agency is saving,
// that is, its heartbeat is from the last half minute; open again once it is older or cleared.
import { afterAll, describe, expect, it } from "vitest";
import { assertNoSheetCheckSaving, lockAddAgainstChecks } from "../../src/sheets/index.js";
import { setup } from "./support/running.js";
import { createTestSheets } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

describe("assertNoSheetCheckSaving", () => {
  it("refuses while a check's heartbeat is fresh and allows once it is stale or gone", async () => {
    const running = await setup(test);
    const now = new Date();
    await running.inOrg((tx) => assertNoSheetCheckSaving(tx, now));

    await running.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: running.sheet.sheetId }, data: { checkStartedAt: now } }),
    );
    await expect(running.inOrg((tx) => assertNoSheetCheckSaving(tx, now))).rejects.toMatchObject({
      code: "CONFLICT",
      reason: "IMPORT_ALREADY_RUNNING",
    });

    const later = new Date(now.getTime() + 31_000);
    await running.inOrg((tx) => assertNoSheetCheckSaving(tx, later));

    await running.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: running.sheet.sheetId }, data: { checkStartedAt: null } }),
    );
    await running.inOrg((tx) => assertNoSheetCheckSaving(tx, now));
  });

  it("takes turns with a check's batch: the guard waits for a transaction that holds the organization's lock", async () => {
    const running = await setup(test);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let held: () => void = () => undefined;
    const holding = new Promise<void>((resolve) => {
      held = resolve;
    });
    // The other side, mid-transaction: it took the lock and has not yet committed its flag.
    const other = running.inOrg(async (tx) => {
      await lockAddAgainstChecks(tx);
      held();
      await gate;
    });
    await holding;
    let passed = false;
    const guard = running
      .inOrg((tx) => assertNoSheetCheckSaving(tx, new Date()))
      .then(() => {
        passed = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(passed).toBe(false);
    release();
    await other;
    await guard;
    expect(passed).toBe(true);
  });
});
