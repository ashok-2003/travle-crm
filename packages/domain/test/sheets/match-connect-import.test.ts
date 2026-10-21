// The connect-time import (spec 3.3): the sheet's rows become an ordinary lead import whose columns need no matching step,
// because they were matched when the sheet was connected. The columns take the sheet's fields, the check starts as the
// connector, and a connector who can no longer act ends the import.
import { afterAll, describe, expect, it } from "vitest";
import { readImportFileListener } from "../../src/imports/index.js";
import { baselineListener, matchSheetImportListener } from "../../src/sheets/index.js";
import { leadJobDependencies } from "../crm/lead-import/support/lead-imports.js";
import { fakeIdentity } from "../imports/support/test-imports.js";
import {
  aConfirmedSheet,
  anAgency,
  createTestSheets,
  eventsOf,
  formHeader,
  jobDependencies,
  memberOf,
  runListener,
} from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

const ashaId = "0199e7a0-0000-7000-8000-00000000a5a5";

async function importAt(options: { access?: "member" | "gone"; owner?: boolean } = {}) {
  const agency = await anAgency(test);
  const importer = memberOf(agency);
  const header = options.owner === true ? [...formHeader, "Handled by"] : formHeader;
  const rows = [
    header,
    [
      "19/10/2026 14:32:10",
      "Asha Sharma",
      "98765 43210",
      "asha@example.test",
      "Goa",
      ...(options.owner === true ? ["Ashu"] : []),
    ],
    ["19/10/2026 15:00:00", "Ravi Kumar", "98765 11111", "", "Kerala", ...(options.owner === true ? ["Nobody"] : [])],
  ];
  const fields =
    options.owner === true
      ? { timestamp: "enquiry_date", fullname: "name", phonenumber: "phone", handledby: "owner" }
      : undefined;
  const sheet = await aConfirmedSheet(test, importer, {
    rows,
    existingRows: "check",
    ...(fields === undefined ? {} : { fields }),
  });
  if (options.owner === true) {
    await test.db.forOrg(agency, (tx) =>
      tx.sheetValueMatch.create({
        data: { connectionId: sheet.sheetId, field: "owner", value: "Ashu", target: ashaId, matchedBy: "chosen" },
      }),
    );
  }
  const identity = fakeIdentity({
    workers: { asha: ashaId },
    access: options.access === "gone" ? null : importer,
    firstOwner: importer.userId,
  });
  await runListener(test, baselineListener(jobDependencies(test, identity)), agency, {
    type: "sheet.baseline-requested",
    payload: { sheetId: sheet.sheetId },
  });
  const importId = (
    await test.db.forOrg(agency, (tx) => tx.importBatch.findFirstOrThrow({ where: { sourceSheetId: sheet.sheetId } }))
  ).id;
  await runListener(test, readImportFileListener(leadJobDependencies(test, identity)), agency, {
    type: "import.uploaded",
    payload: { importId },
  });
  const matched = () =>
    runListener(test, matchSheetImportListener(jobDependencies(test, identity)), agency, {
      type: "import.read",
      payload: { importId, kind: "leads" },
    });
  const state = () =>
    test.db.forOrg(agency, async (tx) => ({
      batch: await tx.importBatch.findUniqueOrThrow({ where: { id: importId } }),
      columns: await tx.importColumn.findMany({ where: { batchId: importId }, orderBy: { position: "asc" } }),
      matches: await tx.importValueMatch.findMany({ where: { batchId: importId, field: "owner" } }),
    }));
  return { agency, importId, matched, state };
}

describe("the connect-time import's matching", () => {
  it("gives the import's columns the sheet's fields, and starts the check", async () => {
    const { agency, importId, matched, state } = await importAt();
    expect((await state()).batch.status).toBe("matching");
    await matched();
    const { batch, columns } = await state();
    expect(batch).toMatchObject({ status: "checking", defaultStage: "new" });
    expect(columns.map((column) => [column.header, column.field])).toEqual([
      ["Timestamp", "enquiry_date"],
      ["Full name", "name"],
      ["Phone number", "phone"],
      ["Email Address", "email"],
      ["Where do you want to go?", null],
    ]);
    expect(await eventsOf(test, agency, ["import.columns-matched"])).toEqual([
      ["import.columns-matched", { importId, kind: "leads" }],
    ]);
    // Run again: the import is checking now, so nothing more happens.
    await matched();
    expect(await eventsOf(test, agency, ["import.columns-matched"])).toHaveLength(1);
  });

  it("carries the Owner values the person matched by hand into the import", async () => {
    const { matched, state } = await importAt({ owner: true });
    await matched();
    const { matches } = await state();
    expect(matches.find((match) => match.value === "Ashu")).toMatchObject({ target: ashaId, matchedBy: "chosen" });
  });

  it("ends the import when the connector can no longer act, as a file's import would", async () => {
    const { matched, state } = await importAt({ access: "gone" });
    await matched();
    expect((await state()).batch).toMatchObject({ status: "failed", failureReason: "no_longer_a_member" });
  });
});
