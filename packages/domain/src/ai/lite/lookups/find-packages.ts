// Finds the packages a customer's words name: whole-word matches only; a near spelling is offered as "closest", never taken.
import { normalised, wordsOf } from "../read-words.js";
import type { PackageIndexEntry } from "../types.js";

const MOST_SHOWN = 3;
const STOP_WORDS = new Set(["the", "trip", "tour", "package", "yatra"]);
const isNights = (word: string) => /^\d+n$/u.test(word);
const meaningful = (text: string): string[] => wordsOf(text).filter((word) => !STOP_WORDS.has(word) && !isNights(word));

function distance(a: string, b: string): number {
  const left = Array.from(a);
  const right = Array.from(b);
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  left.forEach((letter, row) => {
    const current = [row + 1];
    right.forEach((other, column) => {
      current.push(
        Math.min(
          (previous[column + 1] ?? 0) + 1,
          (current[column] ?? 0) + 1,
          (previous[column] ?? 0) + (letter === other ? 0 : 1),
        ),
      );
    });
    previous = current;
  });
  return previous[right.length] ?? 0;
}

/**
 * How far apart two spellings may be and still be called close: one letter for short words, two for the rest, three
 * when both are long (a customer's "Kedarkantha" is three letters from "Kedarnath", and the agency should still hear it).
 */
function close(customer: string, ours: string): boolean {
  const shorter = Math.min(Array.from(customer).length, Array.from(ours).length);
  const allowed = shorter <= 5 ? 1 : shorter >= 8 ? 3 : 2;
  return distance(customer, ours) <= allowed;
}

export function findPackages(
  index: PackageIndexEntry[],
  words: string,
): { exact: PackageIndexEntry[]; closest: PackageIndexEntry[] } {
  const asked = meaningful(words);
  if (asked.length === 0) return { exact: [], closest: [] };
  const sentence = ` ${asked.join(" ")} `;
  const wordsOfEntry = (entry: PackageIndexEntry) => [...meaningful(entry.place ?? ""), ...meaningful(entry.title)];
  const place = (entry: PackageIndexEntry) => normalised(entry.place ?? "");
  const exact = index
    .filter(
      (entry) =>
        wordsOfEntry(entry).some((word) => asked.includes(word)) ||
        (place(entry) !== "" && sentence.includes(` ${place(entry)} `)),
    )
    .slice(0, MOST_SHOWN);
  if (exact.length > 0) return { exact, closest: [] };
  const closest = index
    .filter((entry) => wordsOfEntry(entry).some((ours) => asked.some((theirs) => close(theirs, ours))))
    .slice(0, MOST_SHOWN);
  return { exact: [], closest };
}
