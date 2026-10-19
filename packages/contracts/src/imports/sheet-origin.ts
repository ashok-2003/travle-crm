// Where a lead import's rows came from when a Google Sheet made it (the Sheets sync, its N6): the source detail its
// leads carry, the sheet's time zone for a Timestamp's time, and whether the sheet writes dates month first.
export interface SheetOrigin {
  /** "Goa Diwali campaign · Form responses 1": the sheet's name and tab, as each lead's source detail. */
  detail: string;
  /** The sheet's own time zone, which a date with a time is read in. */
  timeZone: string;
  /** The sheet's locale writes 10/12/2026 for 12 October, so a d/m/y with both parts 12 or less isn't trusted. */
  monthFirstDates: boolean;
}
