// An .xlsx part's elements as read-excel-file sees them (D1): it parses with saxen, drops every namespace prefix from
// element and attribute names (but `xmlns:` declarations) and decodes entities in attribute values. The sizing and
// the first sheet's lookup read the parts the same way, so no markup the reader understands differently slips past.
import { Parser } from "saxen";

/** The name the reader gives an element or attribute: what follows its first prefix. */
export function readerName(name: string, isAttribute = false): string {
  const colon = name.indexOf(":");
  if (colon === -1) return name;
  if (isAttribute && name.startsWith("xmlns:")) {
    const second = name.indexOf(":", colon + 1);
    return second === -1 ? name : name.slice(second + 1);
  }
  return name.slice(colon + 1);
}

/**
 * Whether a raw element or attribute name may be `local` to the reader, for counting: under any prefix, `xmlns:` ones
 * too, which the reader drops from elements and from attributes with a second prefix ("xmlns:x:r" is its "r").
 */
export function isNamed(name: string, local: string, isAttribute = false): boolean {
  return name === local || name.endsWith(`:${local}`) || readerName(name, isAttribute) === local;
}

/** A part's element, its attributes named and decoded as the reader keeps them; `ambiguous` when two raw names meet. */
export interface ReaderElement {
  name: string;
  attributes: Readonly<Record<string, string>>;
  ambiguous: boolean;
}

/** Every element of a whole part, in document order; null when the part isn't XML the parser can read. */
export function readerElementsOf(xml: string): ReaderElement[] | null {
  const parser = new Parser();
  const elements: ReaderElement[] = [];
  // An object, not a variable: the callbacks set it, and TypeScript narrows a variable only callbacks change.
  const state = { broken: false };
  const stop = () => {
    state.broken = true;
    parser.stop();
  };
  parser.on("error", stop);
  parser.on("openTag", (name, attributesOf, decode) => {
    const raw = attributesOf();
    if (raw === false) {
      stop();
      return;
    }
    const attributes: Record<string, string> = {};
    const seen = new Set<string>();
    let ambiguous = false;
    for (const [rawName, value] of Object.entries(raw)) {
      const named = readerName(rawName, true);
      if (seen.has(named)) ambiguous = true;
      seen.add(named);
      attributes[named] = decode(value);
    }
    elements.push({ name: readerName(name), attributes, ambiguous });
  });
  parser.parse(xml);
  return state.broken ? null : elements;
}

/** A cell address as the reader parses it ("XFD2" is row 2, column 16,384); null when it has no row number. */
export function cellAddressOf(address: string): { row: number; column: number } | null {
  let column = 0;
  for (let index = 0; index < address.length; index += 1) {
    const code = address.charCodeAt(index);
    if (code >= 48 && code <= 57) {
      const row = Number(address.slice(index));
      return Number.isNaN(row) ? null : { row, column };
    }
    column = column * 26 + code - 64;
  }
  return null;
}
