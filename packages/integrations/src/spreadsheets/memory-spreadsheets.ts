// An in-memory Spreadsheets for the domain's tests: a sheet travels as JSON bytes, read with the real readers' shape
// and limits; a read can be made to fail with any reason; every writer's rows are kept, and its file reads back.
import { cellText } from "./cell-text.js";
import { sheetShaper } from "./sheet-shape.js";
import {
  type SpreadsheetKind,
  type Spreadsheets,
  SpreadsheetUnreadableError,
  type UnreadableReason,
  type WriterColumn,
  type WrittenCell,
} from "./spreadsheets.js";

export interface MemorySpreadsheets extends Spreadsheets {
  /** A sheet as the bytes this adapter reads: the header is row 1, each row after it the next. */
  bytesOf(sheet: { header: string[]; rows: (string | null)[][]; sheetName?: string }): Uint8Array;
  /** The next read throws SpreadsheetUnreadableError with this reason. */
  failNextRead(reason: UnreadableReason): void;
  /** What each finished writer wrote, oldest first. */
  readonly written: readonly { kind: SpreadsheetKind; columns: readonly WriterColumn[]; rows: WrittenCell[][] }[];
}

interface MemorySheet {
  header: (string | null)[];
  rows: (string | null)[][];
  sheetName?: string;
}

function parsed(bytes: Uint8Array): MemorySheet {
  try {
    const sheet = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    if (typeof sheet === "object" && sheet !== null && "header" in sheet && "rows" in sheet)
      return sheet as MemorySheet;
  } catch {
    // Not JSON: as the real adapter, no spreadsheet.
  }
  throw new SpreadsheetUnreadableError("not_a_spreadsheet");
}

export function createMemorySpreadsheets(): MemorySpreadsheets {
  const written: { kind: SpreadsheetKind; columns: readonly WriterColumn[]; rows: WrittenCell[][] }[] = [];
  let nextFailure: UnreadableReason | null = null;
  const bytesOf = (sheet: MemorySheet) => new TextEncoder().encode(JSON.stringify(sheet));
  return {
    written,
    bytesOf,
    failNextRead: (reason) => {
      nextFailure = reason;
    },
    read: (bytes, limits) => {
      const failure = nextFailure;
      nextFailure = null;
      if (failure !== null) return Promise.reject(new SpreadsheetUnreadableError(failure));
      try {
        const sheet = parsed(bytes);
        const sheetName = limits.kind === "csv" ? null : (sheet.sheetName ?? "Sheet1");
        const shaper = sheetShaper(limits, { sheetName, sheetCount: 1 });
        [sheet.header, ...sheet.rows].forEach((cells, index) => {
          shaper.add({ rowNumber: index + 1, cells: cells.map((cell) => cellText(cell, limits.maxCellLength)) });
        });
        return Promise.resolve(shaper.finish());
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    writer: ({ kind, columns }) => {
      const rows: WrittenCell[][] = [];
      return {
        write: (batch) => {
          rows.push(...batch.map((row) => [...row]));
        },
        finish: () => {
          written.push({ kind, columns, rows });
          const text = (cell: WrittenCell) => (cell === null ? null : String(cell));
          return Promise.resolve(
            bytesOf({ header: columns.map((column) => column.header), rows: rows.map((row) => row.map(text)) }),
          );
        },
      };
    },
  };
}
