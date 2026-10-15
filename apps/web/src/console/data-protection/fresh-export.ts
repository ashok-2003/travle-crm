// Whether the organization has an export a deletion can rely on, as the api decides (hasFreshExport): one finished in
// the last day and still kept (an erasure withdraws every export, which then shows as expired).
import type { OrganizationExport } from "@travel-crm/contracts/platform";

const DAY_MS = 24 * 60 * 60 * 1000;

export function hasFreshExport(exports: OrganizationExport[], now: number = Date.now()): boolean {
  return exports.some(
    (entry) => entry.state === "done" && entry.completedAt !== null && now - Date.parse(entry.completedAt) <= DAY_MS,
  );
}
