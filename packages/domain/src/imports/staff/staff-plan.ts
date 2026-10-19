// Planning a staff file's rows against the agency (B44): the file's own repeats ("Same username as row 4"), an email on
// another organization's account, the Owner role and any role above the importer's, and people already on the staff,
// who are left out without being an error. A row left with no reason is planned new.
import type { RowReason } from "@travel-crm/contracts/imports";
import type { StaffRowFacts } from "../../identity/index.js";
import type { ImportRowPlan } from "../import-rows.js";
import type { StaffRowReading, StaffRowValues } from "./staff-row.js";

const notAdded = (
  rowNumber: number,
  reasons: readonly RowReason[],
  exampleName: string | null,
  exampleValue: string | null,
): ImportRowPlan => ({
  rowNumber,
  plan: "not_added",
  reasons,
  noted: false,
  newDestination: null,
  exampleName,
  exampleValue,
});

/** The usernames and emails of the rows that can be added, for identity to say who they belong to. */
export function namesOfReadyRows(rows: readonly StaffRowReading[]): { usernames: string[]; emails: string[] } {
  const ready = rows.flatMap((row) => (row.kind === "ready" ? [row.values] : []));
  return {
    usernames: ready.flatMap((values) => values.username ?? []),
    emails: ready.flatMap((values) => values.email ?? []),
  };
}

function reasonsOf(
  values: StaffRowValues,
  facts: StaffRowFacts,
  earlier: { usernames: Map<string, number>; emails: Map<string, number> },
): { reasons: RowReason[]; exampleValue: string | null } {
  const username = values.username?.toLowerCase();
  const email = values.email?.toLowerCase();
  // Someone already on the staff is the whole story of their row.
  if (
    (username !== undefined && facts.activeUsernames.has(username)) ||
    (email !== undefined && facts.activeEmails.has(email))
  ) {
    return { reasons: [{ code: "already_on_staff" }], exampleValue: values.username ?? values.email ?? null };
  }
  const reasons: RowReason[] = [];
  let exampleValue: string | null = null;
  const refuse = (reason: RowReason, value: string | null) => {
    reasons.push(reason);
    exampleValue ??= value;
  };
  const sameUsernameAs = username === undefined ? undefined : earlier.usernames.get(username);
  if (sameUsernameAs !== undefined)
    refuse({ code: "same_username_as_row", row: sameUsernameAs }, values.username ?? null);
  else if (username !== undefined) earlier.usernames.set(username, values.rowNumber);
  const sameEmailAs = email === undefined ? undefined : earlier.emails.get(email);
  if (sameEmailAs !== undefined) refuse({ code: "same_email_as_row", row: sameEmailAs }, values.email ?? null);
  else if (email !== undefined) earlier.emails.set(email, values.rowNumber);
  if (email !== undefined && facts.emailsElsewhere.has(email)) {
    refuse({ code: "email_elsewhere", field: "email" }, values.email ?? null);
  }
  const role = facts.roles.get(values.roleKey);
  if (role === undefined) refuse({ code: "role_unmatched", field: "role" }, values.roleKey);
  else if (role.isOwner) refuse({ code: "owner_role", field: "role" }, values.roleKey);
  else if (!role.mayGive) refuse({ code: "role_above_yours", field: "role" }, values.roleKey);
  return { reasons, exampleValue };
}

/** Every row's plan, in file order: the readings' own refusals, then the file's repeats, then the agency's facts. */
export function planStaffRows(rows: readonly StaffRowReading[], facts: StaffRowFacts): ImportRowPlan[] {
  const earlier = { usernames: new Map<string, number>(), emails: new Map<string, number>() };
  return rows.map((row) => {
    if (row.kind === "not_added") return notAdded(row.rowNumber, row.reasons, row.exampleName, row.exampleValue);
    const { reasons, exampleValue } = reasonsOf(row.values, facts, earlier);
    if (reasons.length > 0) return notAdded(row.values.rowNumber, reasons, row.values.name, exampleValue);
    return {
      rowNumber: row.values.rowNumber,
      plan: "new",
      reasons: [],
      noted: false,
      newDestination: null,
      exampleName: row.values.name,
      exampleValue: null,
    };
  });
}
