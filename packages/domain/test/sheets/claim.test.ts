// The spreadsheet claim (S4): taken by the first agency, found theirs the second time, refused to a second agency with a
// sentence that names nothing, won by exactly one of two at once, and released only when no live connection holds it.
import { afterAll, describe, expect, it } from "vitest";
import { DomainError } from "../../src/kernel/index.js";
import { releaseClaimIfUnused, takeSpreadsheetClaim } from "../../src/sheets/index.js";
import { scheduleRowCount } from "../../src/sheets/schedule.js";
import { aSheet, aSpreadsheetId, anAgency, createTestSheets, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const now = new Date("2026-10-19T10:00:00Z");

describe("the spreadsheet claim", () => {
  it("takes a claim for the first agency and finds it theirs the second time", async () => {
    const agency = await anAgency(test);
    const hash = test.hashes.spreadsheetHash(aSpreadsheetId());
    const first = await takeSpreadsheetClaim(test.db, agency, hash, now);
    expect(first.created).toBe(true);
    const second = await takeSpreadsheetClaim(test.db, agency, hash, now);
    expect(second).toEqual({ claimId: first.claimId, created: false });
  });

  it("refuses a second agency with SHEET_CLAIMED_ELSEWHERE, whose message names nothing", async () => {
    const [one, two] = [await anAgency(test), await anAgency(test, "Other agency")];
    const id = aSpreadsheetId();
    const hash = test.hashes.spreadsheetHash(id);
    await takeSpreadsheetClaim(test.db, one, hash, now);
    const refusal = await takeSpreadsheetClaim(test.db, two, hash, now).catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(DomainError);
    expect(refusal).toMatchObject({ code: "CONFLICT", reason: "SHEET_CLAIMED_ELSEWHERE" });
    const message = (refusal as Error).message;
    for (const secret of [id, one, two, "Agency"]) expect(message).not.toContain(secret);
  });

  it("lets exactly one of two agencies win a race for one spreadsheet", async () => {
    const [one, two] = [await anAgency(test), await anAgency(test, "Racing agency")];
    const hash = test.hashes.spreadsheetHash(aSpreadsheetId());
    const results = await Promise.allSettled([
      takeSpreadsheetClaim(test.db, one, hash, now),
      takeSpreadsheetClaim(test.db, two, hash, now),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((result) => result.status === "rejected");
    expect(lost?.reason).toMatchObject({ reason: "SHEET_CLAIMED_ELSEWHERE" });
  });

  it("releases a claim only when no live connection holds it", async () => {
    const agency = await anAgency(test);
    const importer = memberOf(agency);
    const hash = test.hashes.spreadsheetHash(aSpreadsheetId());
    const { claimId } = await takeSpreadsheetClaim(test.db, agency, hash, now);
    // Two tabs of one spreadsheet hold the one claim.
    const spreadsheetId = aSpreadsheetId();
    const [first, second] = await test.db.forOrg(agency, async (tx) => {
      const one = await aSheet(tx, { connectedBy: importer.userId, spreadsheetId, tabGid: "1", claimId });
      const two = await aSheet(tx, { connectedBy: importer.userId, spreadsheetId, tabGid: "2", claimId });
      return [one.id, two.id] as const;
    });
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.update({ where: { id: first }, data: { status: "disconnected" } }),
    );
    expect(await releaseClaimIfUnused(test.db, agency, claimId)).toBe(false);
    // Still taken, so another agency is still refused.
    const other = await anAgency(test, "Late agency");
    await expect(takeSpreadsheetClaim(test.db, other, hash, now)).rejects.toMatchObject({
      reason: "SHEET_CLAIMED_ELSEWHERE",
    });
    await test.db.forOrg(agency, (tx) =>
      tx.sheetConnection.update({ where: { id: second }, data: { status: "disconnected" } }),
    );
    expect(await releaseClaimIfUnused(test.db, agency, claimId)).toBe(true);
    await expect(takeSpreadsheetClaim(test.db, other, hash, now)).resolves.toMatchObject({ created: true });
    expect(await scheduleRowCount(test.db)).toBeGreaterThanOrEqual(0);
  });
});
