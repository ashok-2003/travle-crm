// The report of rows not added (spec B34, B35): in the uploaded format, two first columns saying why each row wasn't
// added and which row it was, then the file's own columns as they were, named after the file.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { MemberAccess } from "../../src/identity/index.js";
import { finishImport, reportFileName, reportSentence } from "../../src/imports/index.js";
import { aRow } from "./support/batches.js";
import {
  anAgency,
  anImportWithFile,
  createTestImports,
  jobDependencies,
  listenerContext,
  memberOf,
  type TestImports,
} from "./support/test-imports.js";

describe("the report of rows not added", () => {
  let test: TestImports;
  let organizationId: string;
  let importer: MemberAccess;

  beforeAll(async () => {
    test = createTestImports();
    organizationId = await anAgency(test);
    importer = memberOf(organizationId);
  });

  afterAll(async () => {
    await test.close();
  });

  it("makes the report in the uploaded format: Why it wasn't added, Row, then the file's columns as they were", async () => {
    const file = test.spreadsheets.bytesOf({
      header: ["Name", "Mobile", "Remarks"],
      rows: [
        ["Asha", "98765 43210", "Goa"],
        ["Ravi", null, "=SUM(1)"],
        ["Meera", "98765 43212", "Kerala"],
        [null, "98765 43213", null],
      ],
    });
    const { id } = await anImportWithFile(test, importer, file, {
      status: "adding",
      fileKind: "xlsx",
      fileName: "enquiries-oct-2026.xlsx",
      sheetName: "Leads Oct",
    });
    await test.db.forOrg(organizationId, async (tx) => {
      await aRow(tx, { batchId: id, rowNumber: 2, plan: "new", outcome: "added" });
      await aRow(tx, { batchId: id, rowNumber: 3, plan: "not_added", reasons: ["no_contact"] });
      await aRow(tx, { batchId: id, rowNumber: 4, plan: "already_imported", reasons: ["already_imported:2026-10-12"] });
      await aRow(tx, { batchId: id, rowNumber: 5, plan: "not_added", reasons: ["no_name"] });
    });
    await finishImport(listenerContext(test, organizationId), jobDependencies(test), id, {
      status: "done",
      sourceEventId: "0199e7a0-0000-7000-8000-00000000e0f1",
      notifyImporter: false,
      report: true,
    });
    expect(test.spreadsheets.written).toHaveLength(1);
    const [report] = test.spreadsheets.written;
    expect(report?.kind).toBe("xlsx");
    expect(report?.columns).toEqual([
      { header: "Why it wasn't added", kind: "text" },
      { header: "Row", kind: "number" },
      { header: "Name", kind: "text" },
      { header: "Mobile", kind: "text" },
      { header: "Remarks", kind: "text" },
    ]);
    expect(report?.rows).toEqual([
      ["No phone, email or Instagram", 3, "Ravi", null, "=SUM(1)"],
      ["Already imported on 12 Oct", 4, "Meera", "98765 43212", "Kerala"],
      ["No name", 5, null, "98765 43213", null],
    ]);
    const attachment = await test.db.forOrg(organizationId, (tx) =>
      tx.attachment.findFirstOrThrow({ where: { recordType: "import_report", recordId: id } }),
    );
    expect(attachment).toMatchObject({
      id,
      fileName: "enquiries-oct-2026 - rows not added.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      status: "ready",
    });
  });

  it("names the report after the file, and says each reason in a sentence", () => {
    expect(reportFileName("enquiries-oct-2026.csv", "csv")).toBe("enquiries-oct-2026 - rows not added.csv");
    expect(reportFileName("Leads.XLSX", "xlsx")).toBe("Leads - rows not added.xlsx");
    expect(reportFileName(`${"x".repeat(200)}.csv`, "csv")).toHaveLength(200);
    const today = "2026-10-20";
    expect(reportSentence({ code: "same_as_row", row: 12 }, today)).toBe("Same as row 12");
    expect(reportSentence({ code: "already_imported", on: "2025-12-01" }, today)).toBe(
      "Already imported on 1 Dec 2025",
    );
    expect(reportSentence({ code: "not_reached" }, today)).toBe("Stopped before this row");
    expect(reportSentence({ code: "notes_too_long" }, today)).toBe("Notes over 4,000 characters");
    expect(reportSentence({ code: "same_username_as_row", row: 4 }, today)).toBe("Same username as row 4");
  });
});
