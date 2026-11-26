// A free-text list (inclusions, exclusions, notes, pickup points) as its points: the one rule the staff screens, the
// customer's page and the PDF share.

/** One point a line, blank lines dropped; a typed bullet comes off only when a space follows it ("-5%" keeps its minus). */
export const pointsOf = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*✓✗]\s+/, "").trim())
    .filter((line) => line !== "");
