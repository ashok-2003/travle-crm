// The fields a person read by the AI can fill on a traveller's row, and what the row holds now: a pure description of each so
// the review can show before and after, tick what is empty, and build the batch save from what was ticked.
import type { FillTraveller } from "@travel-crm/contracts/ai";
import type { SaveTravellersInput, Traveller } from "@travel-crm/contracts/bookings";

export const travellerFieldKeys = [
  "name",
  "dateOfBirth",
  "gender",
  "phone",
  "emergencyName",
  "emergencyPhone",
  "medicalNotes",
  "roomRequest",
  "roomNote",
  "identity",
] as const;
export type TravellerFieldKey = (typeof travellerFieldKeys)[number];

/** The fields this person brings, in the form's order. */
export const fieldsOf = (person: FillTraveller): TravellerFieldKey[] =>
  travellerFieldKeys.filter((key) => person[key] !== undefined);

/** What the row holds at a field now; undefined when it is empty (an identity is only known to exist). */
export function heldValue(row: Traveller, key: TravellerFieldKey): unknown {
  switch (key) {
    case "identity":
      return row.hasIdentity ? "on file" : undefined;
    case "roomRequest":
      return row.roomRequest === "none" ? undefined : row.roomRequest;
    case "dateOfBirth":
    case "gender":
      return row[key] ?? undefined;
    default:
      return row[key] === "" ? undefined : row[key];
  }
}

/** Ticked from the start: the row is empty there, or already holds what the AI read. */
export function startsTicked(person: FillTraveller, row: Traveller | undefined, key: TravellerFieldKey): boolean {
  if (row === undefined) return false;
  const held = heldValue(row, key);
  return held === undefined || (key !== "identity" && held === person[key]);
}

/** One batch entry per person with a row and something ticked; the ID is sent whole or not at all. */
export function entriesOf(
  people: readonly FillTraveller[],
  rowOf: (index: number) => string | null,
  isTicked: (index: number, key: TravellerFieldKey) => boolean,
): SaveTravellersInput["travellers"] {
  return people.flatMap((person, index) => {
    const travellerId = rowOf(index);
    if (travellerId === null) return [];
    const entry: Record<string, unknown> = { travellerId };
    let any = false;
    for (const key of fieldsOf(person)) {
      if (!isTicked(index, key)) continue;
      entry[key] = person[key];
      any = true;
    }
    return any ? [entry as SaveTravellersInput["travellers"][number]] : [];
  });
}
