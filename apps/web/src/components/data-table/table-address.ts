// A table's place in the address (R41; bookings revamp, 2026-11-27): its filters, sort, page and rows per page, so Back
// from a record and a shared link keep them, and Back and Forward walk the pages. Each value has its name there and the
// schema that reads it; a value the schema refuses is left at the list's start, and only what differs from the start is
// written. Only ids and fixed values belong here: the search, a name or a phone, never does (use-table-search.ts).
import type { z } from "zod";

/** How each of a table's values goes in the address: its name there, and what reads it back from the text. */
export type AddressFields<State> = {
  [Key in keyof State]-?: { name: string; schema: z.ZodType<NonNullable<State[Key]>> };
};

/** The table's state as the address says it, the start for whatever it leaves out or says wrongly. */
export function readTableAddress<State extends object>(
  params: Pick<URLSearchParams, "get">,
  fields: AddressFields<State>,
  start: State,
): State {
  const state = { ...start };
  for (const key of Object.keys(fields) as (keyof State)[]) {
    const text = params.get(fields[key].name);
    if (text === null) continue;
    const parsed = fields[key].schema.safeParse(text);
    if (parsed.success) state[key] = parsed.data;
  }
  return state;
}

/** The address of `path` showing this state: "?status=confirmed&page=2", only what differs from the start. */
export function tableAddressHref<State extends object>(
  path: string,
  fields: AddressFields<State>,
  state: Partial<State>,
  start: State,
): string {
  const query = new URLSearchParams();
  for (const key of Object.keys(fields) as (keyof State)[]) {
    const value = state[key];
    if (value === undefined || value === start[key]) continue;
    query.set(fields[key].name, String(value));
  }
  const text = query.toString();
  return text === "" ? path : `${path}?${text}`;
}
