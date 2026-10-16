"use client";

// The destinations the shell shows this member: their role's, on their organization's plan (subscription.get's
// modules). Until the subscription is known nothing is hidden for the plan; the api refuses what it doesn't allow.
// While the subscription shuts the screens, only Home (which says why) and those locks.ts keeps open are offered.
import { routes } from "@/lib/routes";
import { useMe } from "@/session/me-context";
import { lockOf, staysOpen } from "@/subscription/locks";
import { useSubscription } from "@/subscription/use-subscription";
import { visibleNavigationItems, type NavigationItem } from "./navigation";

export function useNavigationItems(): NavigationItem[] {
  const me = useMe();
  const subscription = useSubscription();
  const items = visibleNavigationItems(me, subscription.data?.modules);
  const lock = lockOf(subscription.data, subscription.error);
  if (lock === null) return items;
  const isOwner = me.member.role.isOwner;
  return items.filter((item) => item.href === routes.home || staysOpen(lock, { pathname: item.href, isOwner }));
}
