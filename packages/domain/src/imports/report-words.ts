// The report's sentences (B34): why each row wasn't added, in English, a day shown as the screens show one ("12 Oct",
// with its year when it isn't this one). The screens say the same from imports.json; the file has no translation.
import type { CalendarDate } from "../kernel/index.js";
import type { RowReason, RowReasonCode } from "@travel-crm/contracts/imports";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Oct", or "1 Dec 2025" in another year than `today`'s. */
export function reportDay(day: string, today: string): string {
  const [year, month, date] = day.split("-");
  const shown = `${String(Number(date))} ${months[Number(month) - 1] ?? ""}`;
  return year === today.slice(0, 4) ? shown : `${shown} ${year ?? ""}`;
}

const sentences: Record<RowReasonCode, (reason: RowReason, today: string) => string> = {
  no_name: () => "No name",
  no_contact: () => "No phone, email or Instagram",
  not_a_lead: () => "Marked Not a lead",
  notes_too_long: () => "Notes over 4,000 characters",
  same_as_row: (reason) => `Same as row ${String(reason.row ?? "")}`,
  blocked: () => "A blocked contact",
  already_imported: (reason, today) =>
    reason.on === undefined ? "Already imported" : `Already imported on ${reportDay(reason.on, today)}`,
  in_crm_open: () => "Has an open lead with you",
  in_crm_closed: () => "Has a closed lead with you",
  not_reached: () => "Stopped before this row",
  could_not_add: () => "Couldn't be added: try this row in a new import",
  invalid_name: () => "The name can't be used",
  no_sign_in_name: () => "No username or email",
  invalid_username: () => "The username can't be used",
  invalid_email: () => "The email isn't one",
  invalid_phone: () => "The phone number isn't one",
  same_username_as_row: (reason) => `Same username as row ${String(reason.row ?? "")}`,
  same_email_as_row: (reason) => `Same email as row ${String(reason.row ?? "")}`,
  email_elsewhere: () => "This email is on another organization's account",
  role_unmatched: () => "No role matched",
  owner_role: () => "Add an Owner from Add staff, one at a time",
  role_above_yours: () => "A role above yours",
  already_on_staff: () => "Already on your staff",
  taken_meanwhile: () => "Taken by someone added meanwhile",
};

/** The sentence for a row's first reason, `today` being the agency's day. */
export function reportSentence(reason: RowReason, today: CalendarDate | string): string {
  return sentences[reason.code](reason, today);
}
