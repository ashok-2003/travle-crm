// A Meta lead read as the row of a file (M9, spec 3.4): the form's questions are the columns, the answers the cells, so the
// lead import's own reading (names, phones, trips, the note) reads a lead from Meta as it reads a sheet's row. Pure.
import type { MetaLead } from "@travel-crm/integrations/meta-graph";
import type { MetaQuestionField } from "@travel-crm/contracts/meta-leads";
import type { QuestionMatch } from "./question-fields.js";

export interface LeadAsRow {
  cells: string[];
  /** Each column's header: a note line is labelled with it. */
  headers: string[];
  /** Position to field, for the columns that hold one. */
  fieldAt: Map<number, MetaQuestionField>;
  /** The phone answer as given, "" when none, so a phone that is no number can be told from no phone. */
  phoneGiven: boolean;
}

const humanize = (key: string) =>
  key
    .replaceAll(/[_-]+/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());

const answerOf = (lead: Pick<MetaLead, "answers">, key: string) =>
  (lead.answers[key] ?? [])
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .join(", ");

/** Meta writes a phone as "p:+9198..." in its CSV; the prefix is no part of the number (M11). */
export const withoutPhonePrefix = (text: string) => text.replace(/^p:/i, "");

/**
 * The lead as a row. First and last name become one name cell, in the form's order; city, state and ZIP become one note
 * cell, "From: Jaipur, Rajasthan 302001"; an answer to a question the form's matches don't list is added to the note under
 * its key, so a new question is never lost (spec 3.4).
 */
export function leadAsRow(lead: Pick<MetaLead, "answers">, matches: readonly QuestionMatch[]): LeadAsRow {
  const cells: string[] = [];
  const headers: string[] = [];
  const fieldAt = new Map<number, MetaQuestionField>();
  const add = (header: string, cell: string, field: MetaQuestionField | null) => {
    if (field !== null) fieldAt.set(cells.length, field);
    headers.push(header);
    cells.push(cell);
  };
  const names = matches.filter(
    (match) => match.field === "name" && (match.type === "first_name" || match.type === "last_name"),
  );
  const joinedName = names
    .map((match) => answerOf(lead, match.key))
    .filter((part) => part !== "")
    .join(" ");
  let nameAdded = false;
  const place: string[] = [];
  let phoneGiven = false;
  for (const match of matches) {
    const answer = answerOf(lead, match.key);
    if (match.type === "first_name" || match.type === "last_name") {
      if (!nameAdded && match.field === "name") {
        add("Name", joinedName, "name");
        nameAdded = true;
      } else if (match.field !== "name") add(match.label, answer, match.field);
      continue;
    }
    if (match.type === "city" || match.type === "state" || match.type === "zip") {
      if (match.field === "note") place.push(answer);
      else add(match.label, answer, match.field);
      continue;
    }
    if (match.field === "phone") {
      const phone = withoutPhonePrefix(answer);
      phoneGiven = phoneGiven || phone !== "";
      add(match.label, phone, "phone");
      continue;
    }
    add(match.label, answer, match.field);
  }
  const from = place.filter((part) => part !== "");
  if (from.length > 0) add("From", from.join(", "), "note");
  const listed = new Set(matches.map((match) => match.key));
  for (const key of Object.keys(lead.answers)) {
    const answer = answerOf(lead, key);
    if (!listed.has(key) && answer !== "") add(humanize(key), answer, "note");
  }
  return { cells, headers, fieldAt, phoneGiven };
}
