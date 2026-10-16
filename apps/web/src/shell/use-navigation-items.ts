"use client";

// The destinations the shell shows this member: their role's, on their organization's plan (subscription.get's
// modules). Until the subscription is known nothing is hidden for the plan; the api refuses what it doesn't allow.
import { useMe } from "@/session/me-context";
import { useSubscription } from "@/subscription/use-subscription";
import { visibleNavigationItems, type NavigationItem } from "./navigation";

export function useNavigationItems(): NavigationItem[] {
  const me = useMe();
  const modules = useSubscription().data?.modules;
  return visibleNavigationItems(me, modules);
}
