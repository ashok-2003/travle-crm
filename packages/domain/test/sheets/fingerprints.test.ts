// The sheets' half of "same as a row already added, anywhere": the ledger's fingerprints, plain or re-keyed, and never an
// unresolved problem's or a waiting row's.
import { afterAll, describe, expect, it } from "vitest";
import { earlierSheetFingerprints } from "../../src/sheets/fingerprints.js";
import { fingerprintHex, rowFingerprint } from "../../src/imports/index.js";
import { aSheet, aSheetRow, anAgency, createTestSheets, memberOf } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

describe("earlierSheetFingerprints", () => {
  it("finds a fingerprint in the sheets' ledger, plain or re-keyed, and not an unresolved problem's", async () => {
    const agency = await anAgency(test);
    const importer = memberOf(agency);
    const fingerprintOf = (name: string) => new Uint8Array(rowFingerprint("leads", [name]));
    const [added, merged, erased, dup, problem, waiting, unknown] = ["a", "b", "c", "d", "e", "f", "g"].map(
      fingerprintOf,
    );
    if (added === undefined || merged === undefined || erased === undefined || dup === undefined)
      throw new Error("setup");
    await test.db.forOrg(agency, async (tx) => {
      const sheet = await aSheet(tx, { connectedBy: importer.userId });
      const row = (status: string, fingerprint: Uint8Array<ArrayBuffer> | null, number: number) =>
        aSheetRow(tx, {
          connectionId: sheet.id,
          status,
          fingerprint,
          cells: [`row ${String(number)}`],
          rowNumber: number,
        });
      await row("added", added, 2);
      await row("merged", merged, 3);
      await row("erased", test.hashes.rekey(erased), 4);
      await row("duplicate", dup, 5);
      await row("not_added", null, 6);
      await row("pending", null, 7);
    });
    const asked = [added, merged, erased, dup, problem, waiting, unknown].flatMap((fingerprint) => fingerprint ?? []);
    const found = await test.db.forOrg(agency, (tx) => earlierSheetFingerprints(tx, asked, test.hashes));
    expect([...found.keys()].sort()).toEqual([added, merged, erased, dup].map((value) => fingerprintHex(value)).sort());
    expect(found.get(fingerprintHex(added))).toBeInstanceOf(Date);
    // Without the key the re-keyed one can't be found.
    const keyless = await test.db.forOrg(agency, (tx) => earlierSheetFingerprints(tx, asked, null));
    expect([...keyless.keys()].sort()).toEqual([added, merged, dup].map((value) => fingerprintHex(value)).sort());
    expect((await test.db.forOrg(agency, (tx) => earlierSheetFingerprints(tx, [], test.hashes))).size).toBe(0);
  });

  it("does not see another agency's rows", async () => {
    const [one, two] = [await anAgency(test), await anAgency(test, "Another agency")];
    const fingerprint = new Uint8Array(rowFingerprint("leads", ["shared"]));
    await test.db.forOrg(one, async (tx) => {
      const sheet = await aSheet(tx, { connectedBy: memberOf(one).userId });
      await aSheetRow(tx, { connectionId: sheet.id, status: "added", fingerprint });
    });
    expect((await test.db.forOrg(two, (tx) => earlierSheetFingerprints(tx, [fingerprint], test.hashes))).size).toBe(0);
    expect((await test.db.forOrg(one, (tx) => earlierSheetFingerprints(tx, [fingerprint], test.hashes))).size).toBe(1);
  });
});
