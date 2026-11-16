// What the package form holds while it is edited: text and lists of text, made into the api's input by package-form.tsx.
// Apart from both components so they can share it.
import type { PackageKind } from "@travel-crm/contracts/quotes";
import type { DestinationValue } from "@/leads/form/destination-field";

export interface GroupValues {
  kind: PackageKind;
  roomTypes: string[];
  /** Days as "0" (Sunday) to "6", months as "1" to "12": a toggle group's values are text. */
  weeklyDays: string[];
  departureMonths: string[];
  seatsPerDeparture: string;
  pricesIncludeGst: boolean;
  advancePerPerson: string;
  pickupPoints: string;
  startCity: string;
}

export interface PackageFormValues extends GroupValues {
  name: string;
  title: string;
  slug: string;
  destination: DestinationValue | null;
  nights: string;
  summary: string;
  /** One highlight a line. */
  highlights: string;
  priceDisplay: string;
  fromPrice: string;
  level: string;
  cancellationNotes: string;
  inclusions: string;
  exclusions: string;
  notes: string;
  days: { title: string; description: string }[];
}
