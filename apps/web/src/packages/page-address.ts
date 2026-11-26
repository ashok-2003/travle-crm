// Where a trip's public page lives: its path, and its full address (needs the browser's origin) for copying.
import type { PackageDetail } from "@travel-crm/contracts/quotes";

/** The page's path and full address, or null while the trip has no address yet (or on the server, which has no origin). */
export function pageAddress(detail: PackageDetail): { path: string; full: string } | null {
  if (detail.slug === null || typeof window === "undefined") return null;
  const path = `/a/${detail.agencyCode}/${detail.slug}`;
  return { path, full: `${window.location.origin}${path}` };
}
