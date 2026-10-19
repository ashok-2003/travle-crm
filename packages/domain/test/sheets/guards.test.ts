// The AddGuard of imports' Add (B29): refused with IMPORT_ALREADY_RUNNING while a sheet's check of the agency is saving,
// that is, its heartbeat is from the last half minute; open again once it is older or cleared.
import { afterAll, describe, expect, it } from "vitest";
import { assertNoSheetCheckSaving } from "../../src/sheets/index.js";
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
});
