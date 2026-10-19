// A lead export's columns (spec B38): the header row, in order. The import's guesses know every one, so an export
// imports back. Lead export adds its own shapes here later.

export const leadExportHeaders = [
  "Name",
  "Phone",
  "Email",
  "Instagram",
  "Returning",
  "Stage",
  "Destination",
  "Travel from",
  "Travel to",
  "Travel month",
  "Adults",
  "Children's ages",
  "Budget",
  "Budget basis",
  "Departure city",
  "Trip type",
  "Hotel category",
  "Food",
  "Room type",
  "Owner",
  "Source",
  "Source detail",
  "Added on",
  "Next follow-up",
  "Next follow-up note",
  "Lead link",
] as const;
export type LeadExportHeader = (typeof leadExportHeaders)[number];
