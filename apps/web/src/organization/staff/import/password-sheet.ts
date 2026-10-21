// The one-time sheet of temporary passwords (B48): a CSV the browser writes from its own memory, with a byte-order
// mark and CRLF line ends so Excel reads it as UTF-8, and the formula rule of the exports (B40) so no cell runs as a
// formula. It is a second copy of the adapter's rule, since the web can't import the adapter (D26); both are pinned by
// the same six cases. Nothing is sent anywhere.
export interface SheetPerson {
  name: string;
  username: string | null;
  email: string | null;
  password: string;
}

/** Excel reads a CSV as UTF-8 only when it starts with this. */
const BYTE_ORDER_MARK = "\uFEFF";

export const passwordSheetHeaders = [
  "Name",
  "Username",
  "Email",
  "Temporary password",
  "Organization code",
  "Sign-in page",
] as const;

/** A cell that would run as a formula in a spreadsheet gets one leading apostrophe (B40). */
export function neutraliseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

/** One CSV cell, as the exports write theirs: neutralised, and always quoted. */
function csvCell(text: string | null): string {
  return `"${neutraliseFormula(text ?? "").replaceAll('"', '""')}"`;
}

export function passwordSheetText(people: readonly SheetPerson[], organizationCode: string, signInUrl: string): string {
  const lines = [
    passwordSheetHeaders.map(csvCell),
    ...people.map((person) =>
      [person.name, person.username, person.email, person.password, organizationCode, signInUrl].map(csvCell),
    ),
  ];
  return `${BYTE_ORDER_MARK}${lines.map((cells) => cells.join(",")).join("\r\n")}\r\n`;
}

export function passwordSheet(people: readonly SheetPerson[], organizationCode: string, signInUrl: string): Blob {
  return new Blob([passwordSheetText(people, organizationCode, signInUrl)], { type: "text/csv;charset=utf-8" });
}
