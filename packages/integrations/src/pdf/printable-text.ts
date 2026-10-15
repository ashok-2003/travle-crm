// Which characters the PDF fonts can show. React-PDF draws a character no font has (Devanagari, Tamil, emoji) as
// other letters rather than as an empty box, so a document holding one is refused instead of printed wrong.
import { ownMessages } from "../jobs/sanitize-job-error.js";

/**
 * Code point ranges that every brand font has in both weights (latin and latin-ext files together) and that read back
 * as themselves from the PDF, so copying and searching work: basic Latin, most of Latin-1 and Latin Extended-A,
 * typographic quotes and dashes, ₹ and €. From the @fontsource 5.3.0 files; printable-text.test.ts renders each one
 * in every font and reads it back. Left out although a font has them: µ (reads back as Greek mu), ı, ȷ, ‹, › and ⁄.
 */
const printableRanges: readonly (readonly [number, number])[] = [
  [0x20, 0x7e],
  [0xa0, 0xac],
  [0xae, 0xb4],
  [0xb6, 0x113],
  [0x116, 0x127],
  [0x12a, 0x12b],
  [0x12e, 0x130],
  [0x132, 0x137],
  [0x139, 0x13e],
  [0x141, 0x148],
  [0x14a, 0x14d],
  [0x150, 0x161],
  [0x164, 0x165],
  [0x16a, 0x17e],
  [0x1cd, 0x1ce],
  [0x218, 0x21b],
  [0x2013, 0x2014],
  [0x2018, 0x201a],
  [0x201c, 0x201e],
  [0x2020, 0x2020],
  [0x2022, 0x2022],
  [0x2026, 0x2026],
  [0x20ac, 0x20ac],
  [0x20b9, 0x20b9],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
];

const LINE_BREAK = 0x0a;

/** Text as it is checked and printed: composed accents (NFC), and every kind of line ending as "\n". */
export function normalisedText(text: string): string {
  return text.normalize("NFC").replaceAll(/\r\n?/g, "\n");
}

/** A character as "U+0939", so one that is invisible or unreadable can still be named. */
export const characterLabel = (character: string): string =>
  `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`;

const isPrintable = (codePoint: number): boolean =>
  codePoint === LINE_BREAK || printableRanges.some(([from, to]) => codePoint >= from && codePoint <= to);

/** Every printable character, for tests and for showing people what they may type. */
export function printableCharacters(): string[] {
  return printableRanges.flatMap(([from, to]) =>
    Array.from({ length: to - from + 1 }, (_, offset) => String.fromCodePoint(from + offset)),
  );
}

/** The characters in text that the PDF fonts can't show, each once, in the order they first appear. */
export function unprintableCharacters(text: string): string[] {
  const found = new Set<string>();
  for (const character of normalisedText(text)) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && !isPrintable(codePoint)) found.add(character);
  }
  return [...found];
}

/** Every piece of text in a value: strings, and strings inside arrays and objects. Bytes (a logo) are skipped. */
function textsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value instanceof Uint8Array || value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(textsIn);
}

/** The characters the PDF fonts can't show anywhere in a document's data, each once. */
export function unprintableCharactersIn(value: unknown): string[] {
  return unprintableCharacters(textsIn(value).join(""));
}

/**
 * Thrown, before rendering, for a document holding characters the fonts can't show. It is permanent: the same document
 * fails every time, so a job that gets it should not retry. Match on `code`, which is stable.
 */
export class UnprintableTextError extends Error {
  static {
    ownMessages(this);
  }

  readonly code = "UNPRINTABLE_TEXT";
  readonly characters: readonly string[];

  constructor(characters: readonly string[]) {
    super(
      `This document has characters its fonts can't show yet: ${characters.map((character) => `${character} (${characterLabel(character)})`).join(", ")}`,
    );
    this.name = "UnprintableTextError";
    this.characters = characters;
  }
}
