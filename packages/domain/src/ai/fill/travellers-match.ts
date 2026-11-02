// Which row of the booking a person read by the AI fills (by code, never by the model): a row that already holds the same
// name (case and a little Latin spelling distance, so "Sunitha" finds "Sunita"), else the next empty row in order. A person
// that fits no row gets none: the sheet asks, and no row is ever added.

const letters = (name: string): string => name.toLowerCase().replace(/[^\p{L}\p{M}]/gu, "");

/** Edit distance between two short words. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j] ?? 0;
      row[j] = Math.min(above + 1, (row[j - 1] ?? 0) + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

const sameName = (said: string, held: string): boolean => {
  const [a, b] = [letters(said), letters(held)];
  if (a === "" || b === "") return false;
  return distance(a, b) <= Math.max(0, Math.floor(Math.min(a.length, b.length) / 5));
};

export interface RowToFill {
  id: string;
  /** The name the row holds now ("" when empty). */
  name: string;
}

/** For each person (their name as said, "" when none), the id of the row they fill or null. Rows are used once. */
export function matchRows(names: readonly string[], rows: readonly RowToFill[]): (string | null)[] {
  const used = new Set<string>();
  const chosen: (string | null)[] = names.map(() => null);
  // Named people first find a row that already holds their name, so a later empty-row fill never takes it.
  names.forEach((said, index) => {
    const row = rows.find((one) => !used.has(one.id) && sameName(said, one.name));
    if (row !== undefined) {
      used.add(row.id);
      chosen[index] = row.id;
    }
  });
  names.forEach((_, index) => {
    if (chosen[index] !== null) return;
    const row = rows.find((one) => !used.has(one.id) && one.name.trim() === "");
    if (row !== undefined) {
      used.add(row.id);
      chosen[index] = row.id;
    }
  });
  return chosen;
}
