// A staff file's row, read with Add staff's own schemas (B43, B44, D23): its name, username, email and phone, and its
// role, from the Role column's matched value or the file's one role. A row any of them refuses is not added; the rest
// are planned against the agency in staff-plan.ts.
import { emailAddress, personName, staffUsername } from "@travel-crm/contracts/identity";
import type { RowReason } from "@travel-crm/contracts/imports";
import { phoneNumber } from "@travel-crm/contracts/kernel";
import type { SheetRow } from "@travel-crm/integrations/spreadsheets";
import type { ColumnMatches } from "../column-matches.js";

export interface StaffRowValues {
  rowNumber: number;
  name: string;
  email?: string;
  username?: string;
  /** In E.164. */
  phone?: string;
  roleKey: string;
}

export type StaffRowReading =
  | { kind: "ready"; values: StaffRowValues }
  | {
      kind: "not_added";
      rowNumber: number;
      reasons: RowReason[];
      exampleName: string | null;
      exampleValue: string | null;
    };

export interface StaffRowContext {
  columns: ColumnMatches;
  /** The role key a Role column's value was matched to, or null for none. Called with the cell as the file has it. */
  roleOf(value: string): string | null;
  defaultRoleKey: string | null;
}

/** The text of the cell matched to the field, trimmed; null when there is no such column or the cell is blank. */
function cellOf(row: SheetRow, columns: ColumnMatches, field: "name" | "username" | "email" | "phone" | "role") {
  const position = columns.positionsOf(field)[0];
  const text = position === undefined ? null : (row.cells[position] ?? null);
  return text === null || text.trim() === "" ? null : text;
}

export function readStaffRow(row: SheetRow, context: StaffRowContext): StaffRowReading {
  const { columns } = context;
  const nameCell = cellOf(row, columns, "name");
  const usernameCell = cellOf(row, columns, "username");
  const emailCell = cellOf(row, columns, "email");
  const phoneCell = cellOf(row, columns, "phone");
  const roleCell = cellOf(row, columns, "role");
  const reasons: RowReason[] = [];
  let exampleValue: string | null = null;
  const refuse = (reason: RowReason, value: string | null) => {
    reasons.push(reason);
    exampleValue ??= value;
  };

  const name = nameCell === null ? null : personName.safeParse(nameCell);
  if (name === null) refuse({ code: "no_name" }, null);
  else if (!name.success) refuse({ code: "invalid_name", field: "name" }, nameCell);

  const username = usernameCell === null ? null : staffUsername.safeParse(usernameCell);
  if (username?.success === false) refuse({ code: "invalid_username", field: "username" }, usernameCell);
  const email = emailCell === null ? null : emailAddress.safeParse(emailCell);
  if (email?.success === false) refuse({ code: "invalid_email", field: "email" }, emailCell);
  if (usernameCell === null && emailCell === null) refuse({ code: "no_sign_in_name" }, null);

  const phone = phoneCell === null ? null : phoneNumber.safeParse(phoneCell);
  if (phone?.success === false) refuse({ code: "invalid_phone", field: "phone" }, phoneCell);

  // A blank Role cell, or no Role column, takes the file's role.
  const roleKey = roleCell === null ? context.defaultRoleKey : context.roleOf(roleCell);
  if (roleKey === null) refuse({ code: "role_unmatched", field: "role" }, roleCell);

  if (reasons.length > 0 || !name?.success || roleKey === null) {
    return { kind: "not_added", rowNumber: row.rowNumber, reasons, exampleName: nameCell, exampleValue };
  }
  return {
    kind: "ready",
    values: {
      rowNumber: row.rowNumber,
      name: name.data,
      ...(username?.success === true && { username: username.data }),
      ...(email?.success === true && { email: email.data }),
      ...(phone?.success === true && { phone: phone.data }),
      roleKey,
    },
  };
}
