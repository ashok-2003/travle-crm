// A check whose lease is fresh is the only one (SD4): Sync now and Check again, which run as listeners, wait for it as the
// schedule does, so a person cannot start a second read of the same sheet beside it.
import { afterAll, describe, expect, it } from "vitest";
import { answer, setup as setupSheet } from "./support/running.js";
import { auditOf, createTestSheets } from "./support/sheets.js";
import { freshPhone } from "../crm/support/records.js";

const test = createTestSheets();
afterAll(() => test.close());

describe("a check's lease", () => {
  it("is respected by Sync now's and Check again's checks: nothing is read, nothing added, and the sheet is tried again later", async () => {
    const running = await setupSheet(test);
    running.append(answer("Asha", freshPhone(), 1));
    await running.inOrg((tx) =>
      tx.sheetConnection.update({ where: { id: running.sheet.sheetId }, data: { checkStartedAt: new Date() } }),
    );
    const reads = test.google.calls.reads;
    for (const mode of ["sync-now", "recheck"] as const) {
      const outcome = await running.check(mode);
      expect(outcome.result).toBe("skipped");
    }
    expect(test.google.calls.reads).toBe(reads);
    expect(await running.leads()).toHaveLength(0);
  });

  it("runs as the connector, never as support who connected the sheet while impersonating them (SD16)", async () => {
    const running = await setupSheet(test);
    await running.inOrg((tx) =>
      tx.sheetConnection.update({
        where: { id: running.sheet.sheetId },
        data: { impersonatedBy: "0199a000-0000-7000-8000-0000000000aa" },
      }),
    );
    running.append(answer("Asha", freshPhone(), 1));
    await running.check("sync-now");
    const [lead] = await running.leads();
    expect(lead).toBeDefined();
    const entries = await auditOf(test, running.agency, lead?.id ?? "");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.impersonatedBy === null)).toBe(true);
  });
});
