// What the .xlsx reading thread is given and answers (xlsx-thread.ts, read-xlsx-in-thread.ts): the file's bytes, handed
// over rather than copied, and the limits; then the bounded rows, or why the file can't be read.
import type { ReadLimits, ReadSheet, UnreadableReason } from "./spreadsheets.js";

export interface XlsxThreadInput {
  bytes: ArrayBuffer;
  limits: ReadLimits;
}

export type XlsxThreadAnswer = { sheet: ReadSheet } | { unreadable: UnreadableReason };
