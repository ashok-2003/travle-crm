// Guessing each column's field (B9, D13, D14): the agency's last match of the header first ("As last time"), then
// the common names, each field's own label and our exports' headers, which import back; else nothing. Our report's
// "Why it wasn't added" and "Row" are never guessed, and a field goes to one column only, Note excepted. A Google
// Sheet's leads also try Google Forms' own headers and, when no name fits, a word inside the header (the Sheets sync's
// S12): `wordsInHeader`, off for files.
import { leadExportHeaders } from "@travel-crm/contracts/crm";
import { staffExportHeaders } from "@travel-crm/contracts/identity";
import type { GuessSource, ImportField, ImportKind } from "@travel-crm/contracts/imports";
import { headerKey } from "./header-memory.js";

export interface FieldGuess {
  field: ImportField | null;
  guessedBy: GuessSource | null;
}

/** Each field's common names, its own label first; a header listed under null is guessed Don't import. */
const leadNames: [ImportField | null, readonly string[]][] = [
  ["name", ["Name", "customer name", "client", "guest", "traveller", "naam"]],
  ["phone", ["Phone", "mobile", "mobile no", "contact", "whatsapp"]],
  ["email", ["Email", "email id", "mail id"]],
  ["instagram", ["Instagram"]],
  ["destination", ["Destination", "place", "package", "tour"]],
  ["travel_from", ["Travel from", "travel date", "start date", "date of travel"]],
  ["travel_to", ["Travel to"]],
  ["travel_month", ["Travel month"]],
  ["adults", ["Adults", "pax", "persons"]],
  ["children_ages", ["Children's ages"]],
  ["children_count", ["Number of children"]],
  ["budget", ["Budget", "amount"]],
  ["budget_basis", ["Budget basis"]],
  ["departure_city", ["Departure city"]],
  ["trip_type", ["Trip type"]],
  ["hotel_category", ["Hotel category"]],
  ["food", ["Food"]],
  ["room_type", ["Room type"]],
  ["stage", ["Stage", "status", "lead status"]],
  ["owner", ["Owner", "assigned to", "agent", "executive", "handled by"]],
  // An export's Added on is the lead's enquiry date (B38).
  ["enquiry_date", ["Enquiry date", "date", "lead date", "created on", "Added on"]],
  ["their_source", ["Their source", "source", "lead source", "channel"]],
  ["note", ["Note", "remarks", "notes", "comments", "requirement"]],
  [null, ["Returning", "Source detail", "Next follow-up", "Next follow-up note", "Lead link"]],
];

const staffNames: [ImportField | null, readonly string[]][] = [
  ["name", ["Name", "full name", "staff name", "employee name", "naam"]],
  ["username", ["Username", "user name", "login", "user id"]],
  ["email", ["Email", "email id", "mail id", "e-mail"]],
  ["phone", ["Phone", "mobile", "mobile no", "contact", "whatsapp"]],
  ["role", ["Role", "designation", "position"]],
  [null, ["Joined", "Status", "Last active"]],
];

function byKey(names: readonly [ImportField | null, readonly string[]][], exportHeaders: readonly string[]) {
  const map = new Map<string, ImportField | null>();
  for (const [field, words] of names) for (const word of words) map.set(headerKey(word), field);
  // Every header our own export writes is known, so an export imports back (B38).
  const unknown = exportHeaders.filter((header) => !map.has(headerKey(header)));
  if (unknown.length > 0) throw new Error(`Export headers with no guess: ${unknown.join(", ")}`);
  return map;
}

/** The headers Google Forms writes itself, guessed for a sheet's leads only. */
const formNames = byKey(
  [
    ["enquiry_date", ["Timestamp"]],
    ["email", ["Email Address"]],
    ["name", ["Full name", "Your name"]],
    ["phone", ["Phone number", "Mobile number", "WhatsApp number", "Contact number"]],
  ],
  [],
);

/** Words inside a sheet's header, tried in this order when no name fits it (S12). */
const headerWords: [ImportField, readonly string[]][] = [
  ["phone", ["phone", "mobile", "whatsapp"]],
  ["email", ["email", "mail"]],
  ["name", ["name"]],
  // "go" and "going" are Google Forms' usual ask: "Where do you want to go?".
  ["destination", ["destination", "place", "package", "go", "going", "visit"]],
  ["adults", ["adults", "persons", "pax"]],
  ["budget", ["budget"]],
  ["travel_from", ["date", "when"]],
  ["note", ["message", "remarks", "requirement"]],
];

/** The field of the first of S12's words the header holds as a word of its own ("Which place?" is Destination). */
function fieldOfWords(header: string): ImportField | undefined {
  const words = new Set(header.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  return headerWords.find(([, choices]) => choices.some((word) => words.has(word)))?.[0];
}

const commonNames: Record<ImportKind, ReadonlyMap<string, ImportField | null>> = {
  leads: byKey(leadNames, leadExportHeaders),
  staff: byKey(staffNames, staffExportHeaders),
};

/** Our report's own columns (B34): never anything, whatever the agency did last time. */
const neverGuessed: ReadonlySet<string> = new Set([headerKey("Why it wasn't added"), headerKey("Row")]);

const noGuess: FieldGuess = { field: null, guessedBy: null };

export function guessFields(
  kind: ImportKind,
  headers: readonly string[],
  remembered: ReadonlyMap<string, ImportField | null>,
  options: { wordsInHeader?: boolean } = {},
): FieldGuess[] {
  const sheetWords = options.wordsInHeader === true && kind === "leads";
  const taken = new Set<ImportField>();
  return headers.map((header) => {
    const key = headerKey(header);
    if (neverGuessed.has(key)) return noGuess;
    const named = (sheetWords ? formNames.get(key) : undefined) ?? commonNames[kind].get(key);
    const known = named === undefined && sheetWords ? fieldOfWords(header) : named;
    const guess: FieldGuess = remembered.has(key)
      ? { field: remembered.get(key) ?? null, guessedBy: "last-time" }
      : known === undefined || known === null
        ? noGuess
        : { field: known, guessedBy: "common-name" };
    if (guess.field === null || guess.field === "note") return guess;
    if (taken.has(guess.field)) return noGuess;
    taken.add(guess.field);
    return guess;
  });
}
