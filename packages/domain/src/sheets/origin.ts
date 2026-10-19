// Where a sheet's rows come from, for a lead's source and the reading of dates (S21): the sheet's name and tab as each
// lead's source detail, the sheet's own time zone for a Timestamp's time, and whether its locale writes the month first.
import type { SheetOrigin } from "@travel-crm/contracts/imports";
import type { OrgTx } from "@travel-crm/db";
import type { SheetConnectionRow } from "./connection-row.js";

const MAX_SOURCE_DETAIL = 120;
/** Locales whose dates read month first: 10/12/2026 is 12 October. */
const monthFirstCountries: ReadonlySet<string> = new Set(["US", "PH", "PW", "FM", "MH", "GU", "AS", "MP", "VI", "UM"]);

/**
 * Whether a Google Sheets locale ("en_US", "en_IN", "en") writes dates month first. A locale with no country is read
 * cautiously as month first: an ambiguous date is then kept in the note rather than believed wrongly (Review Focus 1).
 */
export function monthFirstLocale(locale: string): boolean {
  const country = /^[a-z]{2,3}[_-]([A-Za-z]{2})\b/.exec(locale)?.[1]?.toUpperCase();
  return country === undefined || monthFirstCountries.has(country);
}

export function sheetOrigin(
  connection: Pick<SheetConnectionRow, "sheetTitle" | "tabTitle" | "sheetTimeZone" | "sheetLocale">,
): SheetOrigin {
  return {
    detail: `${connection.sheetTitle} · ${connection.tabTitle}`.slice(0, MAX_SOURCE_DETAIL),
    timeZone: connection.sheetTimeZone,
    monthFirstDates: monthFirstLocale(connection.sheetLocale),
  };
}

/** A sheet's origin for the lead import that reads its rows (ImportJobDependencies.sheetOrigin); null when it is gone. */
export async function sheetOriginOf(tx: OrgTx, sheetId: string): Promise<SheetOrigin | null> {
  const sheet = await tx.sheetConnection.findUnique({
    where: { id: sheetId },
    select: { sheetTitle: true, tabTitle: true, sheetTimeZone: true, sheetLocale: true },
  });
  return sheet === null ? null : sheetOrigin(sheet);
}
