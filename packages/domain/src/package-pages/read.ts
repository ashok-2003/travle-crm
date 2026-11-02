// What a visitor may read at /a/<code>/<package> (release 7b), from the database: only published fields of a published package of
// an agency whose pages are on. Never a cost, a margin, a supplier, a tier line or a seat count. Anything else is "not
// available", one answer whether the page was never there, was unpublished or the agency turned its pages off.
import { highlightsOf, type PublicPackageRow } from "./rows.js";
import type { OrgTx } from "@travel-crm/db";
import { publicDepartures, type PublicDepartureRow } from "../departures/index.js";
import { publicPageSettingsOf } from "./settings.js";

export type { PublicPackageRow } from "./rows.js";

const packageColumns = {
  id: true,
  name: true,
  slug: true,
  summary: true,
  nights: true,
  destinationId: true,
  highlights: true,
  days: true,
  inclusions: true,
  exclusions: true,
  cancellationNotes: true,
  priceDisplay: true,
  fromPricePaise: true,
  destination: { select: { name: true } },
} as const;

/** The agency's pages are on. */
export async function pagesAreOn(tx: OrgTx): Promise<boolean> {
  return (await publicPageSettingsOf(tx)).enabled;
}

export async function publishedPackage(tx: OrgTx, slug: string): Promise<PublicPackageRow | null> {
  if (!(await pagesAreOn(tx))) return null;
  const row = await tx.quoteTemplate.findFirst({ where: { slug, published: true }, select: packageColumns });
  return row === null ? null : highlightsOf(row);
}

export async function publishedPackages(tx: OrgTx): Promise<PublicPackageRow[]> {
  if (!(await pagesAreOn(tx))) return [];
  const rows = await tx.quoteTemplate.findMany({
    where: { published: true, slug: { not: null } },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 200,
    select: packageColumns,
  });
  return rows.map(highlightsOf);
}

/** The package's upcoming departures, by words. */
export function departuresOf(
  tx: OrgTx,
  row: Pick<PublicPackageRow, "destinationId">,
  when: { today: string; now: Date },
): Promise<PublicDepartureRow[]> {
  return publicDepartures(tx, { destinationId: row.destinationId, ...when });
}
