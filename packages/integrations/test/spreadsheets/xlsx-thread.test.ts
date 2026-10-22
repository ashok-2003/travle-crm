// An .xlsx is read in a thread of its own (D1, item 2, ADR 0030): whatever a file makes the reader do, it costs that
// thread's heap and time alone. A file that runs it out of either is too large once opened; one the thread can carry
// is read; either way the test process's own heap stays small. A thread that can't run at all is an error of ours,
// never a sentence about the file.
import { describe, expect, it } from "vitest";
import {
  checkXlsxReading,
  createSpreadsheets,
  type ReadLimits,
  SpreadsheetUnreadableError,
  type UnreadableReason,
} from "../../src/spreadsheets/index.js";
import { defaultXlsxThreadOptions } from "../../src/spreadsheets/read-xlsx-in-thread.js";
import {
  crowdedSharedStrings,
  crowdedWorkbookXml,
  deeplyNestedWorkbook,
  rowOf,
  textCell,
  workbookOf,
} from "./sample-files.js";

const limits: ReadLimits = { kind: "xlsx", maxRows: 10_000, maxColumns: 50, maxCellLength: 4000 };
const megabytes = (bytes: number) => bytes / (1024 * 1024);
const small = workbookOf([
  { name: "Leads", sheetData: rowOf(1, textCell("A1", "Name")) + rowOf(2, textCell("A2", "Asha")) },
]);

async function reasonOf(bytes: Uint8Array, spreadsheets = createSpreadsheets()): Promise<UnreadableReason | "read"> {
  try {
    await spreadsheets.read(bytes, limits);
    return "read";
  } catch (error) {
    if (error instanceof SpreadsheetUnreadableError) return error.reason;
    throw error;
  }
}

/** Read, or refused for `reason`, within the thread's minute, the test process's heap growing by under 64 MB. */
async function expectApart(bytes: Uint8Array, reason: UnreadableReason | "read") {
  const before = process.memoryUsage().heapUsed;
  const started = performance.now();
  expect(await reasonOf(bytes)).toBe(reason);
  expect(performance.now() - started).toBeLessThan(defaultXlsxThreadOptions.timeoutMs);
  expect(megabytes(process.memoryUsage().heapUsed - before)).toBeLessThan(64);
}

describe("reading an .xlsx in a thread of its own", () => {
  it("reads a workbook there and leaves the caller's bytes as they were", async () => {
    const sheet = await createSpreadsheets().read(small, limits);
    expect(sheet.rows).toEqual([{ rowNumber: 2, cells: ["Asha"] }]);
    expect(small.byteLength).toBeGreaterThan(0);
    expect(await reasonOf(small)).toBe("read");
  });

  it("refuses the re-reviewer's out-of-memory file, 3,000 prefixed rows, apart", async () => {
    const rows = Array.from(
      { length: 3000 },
      (_, index) => `<row r="${String(index + 2)}"><c xmlns:x:r="XFD${String(index + 2)}"><v>1</v></c></row>`,
    ).join("");
    await expectApart(
      workbookOf([{ name: "Leads", sheetData: rowOf(1, textCell("A1", "Name")) + rows }]),
      "too_many_columns",
    );
  });

  // The bound is generous on purpose: a busy machine took over two seconds, while reading all 12 million elements takes far longer.
  it(
    "refuses a workbook.xml of 12 million elements at once, by its first 10,000 (X8)",
    { timeout: 60_000 },
    async () => {
      const started = performance.now();
      await expectApart(crowdedWorkbookXml(12_000_000), "not_a_spreadsheet");
      expect(performance.now() - started).toBeLessThan(20_000);
    },
  );

  it("refuses 16 million nested elements apart", { timeout: 120_000 }, async () => {
    await expectApart(deeplyNestedWorkbook(16_000_000), "not_a_spreadsheet");
  });

  it("reads past 9 million empty shared strings apart (item 10)", { timeout: 120_000 }, async () => {
    await expectApart(crowdedSharedStrings(9_000_000), "read");
  });

  it(
    "refuses shared strings that run the thread's heap out, the worker's untouched",
    { timeout: 120_000 },
    async () => {
      await expectApart(crowdedSharedStrings(1_800_000, "<si><t>abcdefghijklmno</t></si>"), "too_large_unpacked");
    },
  );

  it("stops a read that takes longer than its time, as too large once opened", async () => {
    expect(await reasonOf(small, createSpreadsheets({ xlsxThread: { timeoutMs: 1 } }))).toBe("too_large_unpacked");
  });

  it("says a file is damaged when its thread throws or ends without an answer, never retrying it (X9)", async () => {
    for (const thread of ["throws.ts", "exits.ts"]) {
      const broken = createSpreadsheets({ xlsxThread: { file: new URL(`./threads/${thread}`, import.meta.url) } });
      expect(await reasonOf(small, broken), thread).toBe("not_a_spreadsheet");
    }
  });

  it("fails plainly, naming no file's content, when the thread can't run", async () => {
    const broken = createSpreadsheets({ xlsxThread: { file: new URL("./no-such-thread.mjs", import.meta.url) } });
    const failure = await broken.read(small, limits).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(SpreadsheetUnreadableError);
    expect(failure).toHaveProperty("message", "The .xlsx reader's thread failed: MODULE_NOT_FOUND");
  });

  it("checks at a worker's start that the thread reads, and fails the start when it can't", async () => {
    await expect(checkXlsxReading(createSpreadsheets())).resolves.toBeUndefined();
    const broken = createSpreadsheets({ xlsxThread: { file: new URL("./no-such-thread.mjs", import.meta.url) } });
    await expect(checkXlsxReading(broken)).rejects.toThrow("The .xlsx reader's thread failed: MODULE_NOT_FOUND");
  });
});
