// The owner's no-dash rule (2026-11-25): staff on WhatsApp don't write "—", and a model that does reads as AI. The prompt
// asks for none, but the model still writes some (31% of the first live replies on prompt v5), so the reply's dashes are
// turned into commas before it is sent. Ranges and routes ("4–5", "Manali–Kasol") and hyphens stay.
/** A dash opening a line, as a list mark, or closing it: dropped. */
const LEAD = /^[^\S\n]*[—–][^\S\n]*/u;
const TRAIL = /[^\S\n]*[—–][^\S\n]*$/u;
/** A dash between words: an em dash, spaced or not, or a spaced en dash; with a punctuation mark just before it, if any. */
const BETWEEN = /([,.;:!?])?[^\S\n]*(?:—|[^\S\n]–[^\S\n])[^\S\n]*/gu;

/** The reply with each dash between words made a comma (a space after a mark already there), and none at a line's ends. */
export function withoutDashes(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      line
        .replace(LEAD, "")
        .replace(TRAIL, "")
        .replace(BETWEEN, (_dash, mark: string | undefined) => (mark === undefined ? ", " : `${mark} `)),
    )
    .join("\n");
}
