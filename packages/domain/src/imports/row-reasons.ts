// A row's reasons as the import_row table keeps them (D8): "code", "code:field", "same_as_row:12" or
// "already_imported:2026-10-12", one text a reason, readable in SQL. The api sends them as objects.
import { importField, rowReasonCode, type RowReason, type RowReasonCode } from "@travel-crm/contracts/imports";
import { calendarDate } from "@travel-crm/contracts/kernel";

/** Reasons that name an earlier row of the file, and the one that names the day it was imported. */
const rowNaming: readonly RowReasonCode[] = ["same_as_row", "same_username_as_row", "same_email_as_row"];

export function encodeRowReason(reason: RowReason): string {
  const detail = reason.row ?? reason.on ?? reason.field;
  return detail === undefined ? reason.code : `${reason.code}:${String(detail)}`;
}

export function decodeRowReason(text: string): RowReason {
  const separator = text.indexOf(":");
  const code = rowReasonCode.safeParse(separator === -1 ? text : text.slice(0, separator));
  if (!code.success) throw new RangeError(`Not a row reason: ${JSON.stringify(text)}`);
  if (separator === -1) return { code: code.data };
  const detail = text.slice(separator + 1);
  if (rowNaming.includes(code.data)) return { code: code.data, row: Number(detail) };
  if (code.data === "already_imported") return { code: code.data, on: calendarDate.parse(detail) };
  return { code: code.data, field: importField.parse(detail) };
}
