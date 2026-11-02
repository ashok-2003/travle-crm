// A message that offers seats says "a few seats" unless the agency lets it say how many: the model is told so, and plain code
// checks. Any count of seats it wrote that is not the real, allowed one becomes "a few".

const NUMBER_WORDS = [
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
] as const;

const COUNT = new RegExp(
  String.raw`\b(\d+|${NUMBER_WORDS.join("|")})(?:\s+(?:more|last|remaining|left|open|empty|available)){0,2}\s+(seats?|spots?|places?|slots?|berths?)\b`,
  "giu",
);

const valueOf = (written: string): number => {
  const index = NUMBER_WORDS.indexOf(written.toLowerCase() as (typeof NUMBER_WORDS)[number]);
  return index >= 0 ? index + 1 : Number(written);
};

/** Replaces each count of seats other than `allowed` with "a few" (all of them when `allowed` is null). */
export function withoutSeatCounts(text: string, allowed: number | null): string {
  return text.replace(COUNT, (match: string, written: string, noun: string) =>
    allowed !== null && valueOf(written) === allowed ? match : `a few ${noun.replace(/s$/i, "")}s`,
  );
}
