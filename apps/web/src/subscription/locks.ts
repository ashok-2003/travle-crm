// Whether the subscription shuts the organization's screens (spec 7.3): suspended (only the Owner's exports and
// revocations work), cancelled (nothing works) or never set up (NO_SUBSCRIPTION); and the screens that stay open:
// the person's own account and notification choices (their calls answer in every state), and for the Owner while
// suspended, Staff,
// where removing someone or giving them a new password still works, Documents, whose PDFs download and whose share
// links turn off, and the business files, which list and download (ADR 0021).
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { refusalOf } from "@/data/api-error";
import { routes } from "@/lib/routes";

export type Lock = "suspended" | "cancelled" | "noSubscription";

/** From subscription.get's answer, or its refusal. Loading, unreachable or open: no lock (the api decides). */
export function lockOf(overview: SubscriptionOverview | undefined, error: unknown): Lock | null {
  // A failed refresh keeps the last answer beside its error: the refusal is the newer news.
  if (refusalOf(error)?.reason === "NO_SUBSCRIPTION") return "noSubscription";
  switch (overview?.access) {
    case "export_only":
      return "suspended";
    case "locked":
      return "cancelled";
    case undefined:
    case "full":
    case "read_only":
      return null;
  }
}

/** The suspended Owner's screens: every call they make is an export or a revocation. */
const SUSPENDED_OWNER_SCREENS = [routes.staff, routes.documents, routes.files];

/** Whether the screen at `pathname` shows despite the lock. */
export function staysOpen(lock: Lock, { pathname, isOwner }: { pathname: string; isOwner: boolean }): boolean {
  const at = (route: string) => pathname === route || pathname.startsWith(`${route}/`);
  // The person's own account and choices, whose calls answer in every state: every notification email's unsubscribe
  // link opens /account/notifications, and must work whatever the organization has paid (DPDP).
  if (at(routes.account)) return true;
  return lock === "suspended" && isOwner && SUSPENDED_OWNER_SCREENS.some(at);
}
