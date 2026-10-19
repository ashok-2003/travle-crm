// The formula rule (B40): text a spreadsheet would run as a formula gets one leading apostrophe, so a cell is always a
// value. The reader drops that apostrophe again (B3), so a file this product exports imports back as it was.

const formulaStart = /^[=+\-@\t\r]/;

export function neutraliseFormula(text: string): string {
  return formulaStart.test(text) ? `'${text}` : text;
}
