// The same row in a file imported after a sheet added it is "already imported" (B33, SD15, owner: no duplicates), and a
// row the sheet never saw is not.
import { afterAll, describe, expect, it } from "vitest";
import { checkLeadImportListener } from "../../src/crm/index.js";
import { earlierSheetFingerprints } from "../../src/sheets/index.js";
import { aLeadImport, stepEvent } from "../crm/lead-import/support/lead-imports.js";
import { freshPhone } from "../crm/support/records.js";
import { fakeIdentity, jobDependencies, listenerContext } from "../imports/support/test-imports.js";
import { answer, setup as setupSheet } from "./support/running.js";
import { createTestSheets } from "./support/sheets.js";

const test = createTestSheets();
afterAll(() => test.close());

describe("a file imported after a sheet", () => {
  it("meets the rows the sheet added: the same row is already imported, a new one is not", async () => {
    const running = await setupSheet(test);
    const phone = freshPhone();
    running.append(answer("Asha Sharma", phone, 1));
    await running.check("sync-now");
    expect(await running.leads()).toHaveLength(1);

    const { id } = await aLeadImport(test, running.importer, {
      header: ["Timestamp", "Full name", "Phone number", "Email Address"],
      fields: ["enquiry_date", "name", "phone", "email"],
      rows: [
        ["19/10/2026 14:01:00", "Asha Sharma", phone, ""],
        ["19/10/2026 14:02:00", "Ravi Kumar", freshPhone(), ""],
      ],
    });
    await checkLeadImportListener({
      ...jobDependencies(test, fakeIdentity({ access: running.importer, firstOwner: running.importer.userId })),
      sheetFingerprints: (tx, fingerprints) => earlierSheetFingerprints(tx, fingerprints, test.hashes),
    }).handle(stepEvent(running.agency, "import.columns-matched", id), listenerContext(test, running.agency));
    const rows = await running.inOrg<{ rowNumber: number; plan: string }[]>((tx) =>
      tx.importRow.findMany({
        where: { batchId: id },
        orderBy: { rowNumber: "asc" },
        select: { rowNumber: true, plan: true },
      }),
    );
    expect(rows.map((row) => row.plan)).toEqual(["already_imported", "new"]);
  });
});
