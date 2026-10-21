// The keys a sheet's columns are known by (S11): the reader's own naming of the headers (a blank is "Column C", a
// repeat "(2)"), each made a header key, and made unique within the sheet so two different headers that squeeze to
// one key (a "Phone No" and a "PhoneNo") stay two columns.
import { columnLetters, nameHeaders } from "@travel-crm/integrations/spreadsheets";
import { headerKey } from "../imports/index.js";

export interface HeaderName {
  /** The header as named: trimmed, blanks by their letter, repeats numbered. */
  header: string;
  /** Unique in the sheet; the later of two equal keys gains "~2", "~3". */
  key: string;
}

export function nameColumns(rawHeader: readonly string[]): HeaderName[] {
  const seen = new Map<string, number>();
  return nameHeaders(rawHeader).map((named, index) => {
    // A header of only punctuation squeezes to nothing: it is known by its letter, as a blank one is.
    const base = (headerKey(named) || headerKey(`Column ${columnLetters(index)}`)).slice(0, 190);
    const times = (seen.get(base) ?? 0) + 1;
    seen.set(base, times);
    return { header: named.slice(0, 200), key: times === 1 ? base : `${base}~${String(times)}` };
  });
}
