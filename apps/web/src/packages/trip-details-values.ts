// The values of Trip details' one form (the itinerary and what the trip includes), how they start from a trip and how
// they become the api's fields: shared by the form's two halves (section-itinerary.tsx, section-details.tsx) and its
// section. A custom trip has no pickup points or start city to send.
import type { PackageDetail, QuoteDay } from "@travel-crm/contracts/quotes";
import type { DestinationValue } from "@/leads/form/destination-field";

export interface TripDetailsValues {
  name: string;
  destination: DestinationValue | null;
  nights: string;
  days: QuoteDay[];
  inclusions: string;
  exclusions: string;
  pickupPoints: string;
  startCity: string;
  notes: string;
  cancellationNotes: string;
}

export const tripDetailsValuesOf = (detail: PackageDetail): TripDetailsValues => ({
  name: detail.name,
  destination:
    detail.destinationId === null
      ? null
      : { kind: "existing", destinationId: detail.destinationId, name: detail.destinationName ?? "" },
  nights: detail.nights === null ? "" : String(detail.nights),
  days: detail.days,
  inclusions: detail.inclusions,
  exclusions: detail.exclusions,
  pickupPoints: detail.pickupPoints,
  startCity: detail.startCity,
  notes: detail.notes,
  cancellationNotes: detail.cancellationNotes,
});

/** The form's field each of the api's fields belongs to; a refused day is the form's own problem (no field holds it). */
export const tripDetailsFieldOf: Partial<Record<string, keyof TripDetailsValues>> = {
  name: "name",
  destinationId: "destination",
  newDestinationName: "destination",
  nights: "nights",
  inclusions: "inclusions",
  exclusions: "exclusions",
  pickupPoints: "pickupPoints",
  startCity: "startCity",
  notes: "notes",
  cancellationNotes: "cancellationNotes",
};

/** The values as the api's fields; text that is not a number becomes -1, which its schema refuses. */
export function tripDetailsFields(typed: TripDetailsValues, group: boolean) {
  const nights = typed.nights.trim();
  return {
    name: typed.name,
    destinationId: typed.destination?.kind === "existing" ? typed.destination.destinationId : null,
    ...(typed.destination?.kind === "new" && { newDestinationName: typed.destination.name }),
    nights: nights === "" ? null : /^\d{1,2}$/.test(nights) ? Number(nights) : -1,
    days: typed.days.filter((day) => day.title.trim() !== ""),
    inclusions: typed.inclusions,
    exclusions: typed.exclusions,
    ...(group && { pickupPoints: typed.pickupPoints, startCity: typed.startCity }),
    notes: typed.notes,
    cancellationNotes: typed.cancellationNotes,
  };
}
