// Sizes a sheet's part as read-excel-file will read it (B4, D1), while it inflates: saxen from npm, of which the reader
// vendors a copy, is fed the XML a piece at a time and counts the rows, the furthest row number and the furthest column holding a cell
// that isn't self-closing, whatever the quoting, prefixes, comments, CDATA or entities. Every number a row or cell
// could be read as counts, and rows without one follow on. Elements nested past a hundred deep are refused. The first
// limit passed stops the parse.
import { Parser } from "saxen";
import type { UnreadableReason } from "./spreadsheets.js";
import { cellAddressOf, isNamed } from "./xml-elements.js";

/** Markup this long with no tag, text or comment finished is no spreadsheet's (Excel's cell holds 32,767 characters). */
const MAX_QUIET_CHARACTERS = 1024 * 1024;

/** Elements open at once past this are no spreadsheet's (a cell's text is about six deep), and the parser keeps each. */
const MAX_DEPTH = 100;

/** Text goes to the parser in pieces this long, so what it buffers stays under a piece and the quiet bound. */
const PIECE_CHARACTERS = 64 * 1024;

export interface SheetPartSize {
  rows: number;
  lastRowNumber: number;
  /** The last column (1-based) holding a cell that isn't self-closing, so possibly not empty. */
  lastColumn: number;
  /** Why the part can't be read, as soon as it is known. */
  refusal: UnreadableReason | null;
}

/**
 * Every value an element's attributes might give `local` to the reader, which keeps one of them: each decoded once,
 * and twice, as the reader decodes a prefixed name's value into the plain name and then decodes that again when the
 * plain name follows (xml-elements.test.ts).
 */
function valuesOf(attributes: Record<string, string>, decode: (text: string) => string, local: string): string[] {
  return Object.entries(attributes).flatMap(([name, value]) => {
    if (!isNamed(name, local, true)) return [];
    const once = decode(value);
    return [once, decode(once)];
  });
}

export function sheetSizer(limits: { maxRowNumber: number; maxColumn: number }) {
  const size: SheetPartSize = { rows: 0, lastRowNumber: 0, lastColumn: 0, refusal: null };
  const parser = new Parser();
  const decoder = new TextDecoder();
  let pending = "";
  let quiet = 0;
  let depth = 0;
  const refuse = (reason: UnreadableReason) => {
    size.refusal ??= reason;
    parser.stop();
  };
  const heard = () => {
    quiet = 0;
  };
  // A function, not the property: the parser's callbacks set it, which TypeScript's narrowing doesn't see.
  const going = () => size.refusal === null;
  const check = () => {
    if (Math.max(size.rows, size.lastRowNumber) > limits.maxRowNumber) refuse("too_many_rows");
    else if (size.lastColumn > limits.maxColumn) refuse("too_many_columns");
  };
  parser.on("openTag", (name, attributesOf, decode, selfClosing) => {
    heard();
    // A self-closing element closes too (closeTag), so it never adds to the depth.
    depth += 1;
    if (depth > MAX_DEPTH) {
      refuse("not_a_spreadsheet");
      return;
    }
    const isRow = isNamed(name, "row");
    if (!isRow && !isNamed(name, "c")) return;
    const attributes = attributesOf();
    // Attributes the parser can't read might be read otherwise by the reader's copy of it.
    if (attributes === false) {
      refuse("not_a_spreadsheet");
      return;
    }
    const positions = valuesOf(attributes, decode, "r");
    if (isRow) {
      size.rows += 1;
      const numbers = positions.map(Number).filter((number) => !Number.isNaN(number));
      size.lastRowNumber = Math.max(size.lastRowNumber, size.rows, ...numbers);
    } else {
      for (const cell of positions.map(cellAddressOf)) {
        if (cell === null) continue;
        size.lastRowNumber = Math.max(size.lastRowNumber, cell.row);
        if (!selfClosing) size.lastColumn = Math.max(size.lastColumn, cell.column);
      }
    }
    check();
  });
  parser.on("closeTag", () => {
    heard();
    depth -= 1;
  });
  parser.on("text", heard);
  parser.on("comment", heard);
  parser.on("cdata", heard);
  parser.on("question", heard);
  parser.on("attention", heard);
  parser.on("error", () => {
    refuse("not_a_spreadsheet");
  });

  const feed = (piece: string) => {
    quiet += piece.length;
    if (quiet > MAX_QUIET_CHARACTERS) refuse("not_a_spreadsheet");
    else parser.write(piece);
  };
  return {
    size,
    /** The part's next inflated bytes; `final` on its last. Nothing more is parsed once the part is refused. */
    push(chunk: Uint8Array, final: boolean): void {
      if (!going()) return;
      pending += decoder.decode(chunk, { stream: !final });
      let offset = 0;
      while (going() && (pending.length - offset >= PIECE_CHARACTERS || (final && offset < pending.length))) {
        feed(pending.slice(offset, offset + PIECE_CHARACTERS));
        offset += PIECE_CHARACTERS;
      }
      pending = pending.slice(offset);
      if (final && going()) parser.end();
    },
  };
}
