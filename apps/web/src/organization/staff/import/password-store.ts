// The staff import's temporary passwords, in this tab's memory and nowhere else (B46, B48): a module-level map from an
// import to its rows' passwords, made when Add is pressed and emptied when the import's screen unmounts. Never in the
// query cache, IndexedDB, web storage or a mutation's variables: the calls that send them read them from here.
const passwords = new Map<string, ReadonlyMap<number, string>>();

export const passwordStore = {
  /** Keeps the passwords of an import, by the row each belongs to. */
  keep(importId: string, byRow: ReadonlyMap<number, string>): void {
    passwords.set(importId, new Map(byRow));
  },
  /** Adds to what is kept (B50's new passwords for the people who hadn't signed in). */
  add(importId: string, byRow: ReadonlyMap<number, string>): void {
    passwords.set(importId, new Map([...(passwords.get(importId) ?? []), ...byRow]));
  },
  get(importId: string): ReadonlyMap<number, string> | undefined {
    return passwords.get(importId);
  },
  forget(importId: string): void {
    passwords.delete(importId);
  },
};
