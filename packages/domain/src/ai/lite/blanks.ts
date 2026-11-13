// The blanks the Write model copies and code fills: "[date 1]", "[answer]". The model never types an amount, a date or a
// seat count; it names the blank, and code writes the value and records where, so the reply check skips that span.
import type { Found } from "./phrase-match.js";
import { oneLine } from "./context/blocks.js";

export type BlankKind = "package" | "from" | "date" | "seats" | "answer" | "choice" | "agency" | "agent";

/** These kinds are single: "[answer]", not "[answer 1]". */
const SINGLE = new Set<BlankKind>(["answer", "agency", "agent"]);
const BRACKET = /\[[^[\]]*\]/g;

/** The same blank however it was spaced or capitalised: "[Date  1]" is "[date 1]". */
const canonical = (found: string): string => `[${found.slice(1, -1).trim().toLowerCase().split(/\s+/).join(" ")}]`;

export class Blanks {
  private readonly entries: { name: string; value: string; about: string; shown: boolean }[] = [];

  /** Adds a blank and returns its name. `shown` lets the model read the value (a trip's title); otherwise it reads `about`. */
  add(kind: BlankKind, value: string, about: string, shown: boolean): string {
    const number = this.entries.filter((entry) => entry.name.startsWith(`[${kind}`)).length + 1;
    if (SINGLE.has(kind) && number > 1) throw new RangeError(`There is only one [${kind}] blank`);
    const name = SINGLE.has(kind) ? `[${kind}]` : `[${kind} ${String(number)}]`;
    this.entries.push({ name, value, about, shown });
    return name;
  }

  /** One line per blank for the Facts block. */
  lines(): string[] {
    return this.entries.map(({ name, value, about, shown }) =>
      shown ? `${name} = ${oneLine(value)} (${about})` : `${name}: ${about}`,
    );
  }

  values(): ReadonlyMap<string, string> {
    return new Map(this.entries.map((entry) => [entry.name, entry.value]));
  }
}

export interface Filled {
  text: string;
  /** Where code wrote, as positions in `text`, so the check can skip them. */
  filled: Found[];
  /** Brackets that are no blank of this move; they stay in the text as they were. */
  unknown: string[];
}

export function fillBlanks(text: string, values: ReadonlyMap<string, string>): Filled {
  let output = "";
  let last = 0;
  const filled: Found[] = [];
  const unknown: string[] = [];
  for (const match of text.matchAll(BRACKET)) {
    const value = values.get(canonical(match[0]));
    output += text.slice(last, match.index);
    last = match.index + match[0].length;
    if (value === undefined) {
      output += match[0];
      if (!unknown.includes(match[0])) unknown.push(match[0]);
      continue;
    }
    filled.push({ start: output.length, end: output.length + value.length });
    output += value;
  }
  return { text: output + text.slice(last), filled, unknown };
}
