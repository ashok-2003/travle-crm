// Whether a change was cited from lines about another trip: a cited line naming other nights ("5N/6D", "6D/5N",
// "5 nights 6 days"), or, when it names none, the nearest line above it that does (the heading it sits under). The
// 5N/6D prices are never the 4N/5D trip's.

/** "4N/5D", "4N5D", "4 nights 5 days": nights first. */
const NIGHTS_FIRST = /(?<!\d)(\d{1,2})\s*(?:n|nights?)\s*[/&,-]?\s*\d{1,2}\s*(?:d|days?)\b/gi;
/** "5D/4N", "5 days 4 nights": days first. */
const DAYS_FIRST = /(?<!\d)\d{1,2}\s*(?:d|days?)\s*[/&,-]?\s*(\d{1,2})\s*(?:n|nights?)\b/gi;

/** The nights a text names, in either order. */
export function nightsIn(text: string): number[] {
  return [...text.matchAll(NIGHTS_FIRST), ...text.matchAll(DAYS_FIRST)].map((match) => Number(match[1]));
}

const NUMBERED = /^(L|P\d+\.L|A)(\d+)$/;

/** The ref of the line just above in the same source ("L4" for "L5", "P1.L2" for "P1.L3"); none above an answer or a first line. */
function refAbove(ref: string): string | null {
  const match = NUMBERED.exec(ref);
  if (match === null || match[1] === "A") return null;
  const number = Number(match[2]);
  return number <= 1 ? null : `${match[1] ?? ""}${String(number - 1)}`;
}

/**
 * Whether any cited line is about a trip of other nights: by what it names, or, naming none, by the nearest line above it
 * that names some. `lineOf` reads a line by its ref (code's lines, and the AI's reading of photos).
 */
export function aboutOtherTrip(
  cited: readonly string[],
  lineOf: (ref: string) => string | undefined,
  nights: number | null,
): boolean {
  if (nights === null) return false;
  const other = (text: string) => nightsIn(text).some((named) => named !== nights);
  return cited.some((ref) => {
    for (let at: string | null = ref; at !== null; at = refAbove(at)) {
      const text = lineOf(at);
      if (text === undefined) continue;
      if (nightsIn(text).length > 0) return other(text);
    }
    return false;
  });
}
