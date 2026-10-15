// Whether the subscription shuts the organization's screens (spec 7.3): suspended (only the Owner's exports and
// revocations work), cancelled (nothing works) or never set up (NO_SUBSCRIPTION); and the screens that stay open:
// the person's own account (me.get and Better Auth answer in every state), and Staff for the Owner while suspended,
// where removing someone or giving them a new password still works (ADR 0021).
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

/** Whether the screen at `pathname` shows despite the lock. */
export function staysOpen(lock: Lock, { pathname, isOwner }: { pathname: string; isOwner: boolean }): boolean {
  if (pathname === routes.account) return true;
  const atStaff = pathname === routes.staff || pathname.startsWith(`${routes.staff}/`);
  return lock === "suspended" && isOwner && atStaff;
}
