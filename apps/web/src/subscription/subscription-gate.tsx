"use client";

// Shuts the organization's screens while its subscription does (spec 7.3): suspended, cancelled or never set up, the
// screen is replaced by one saying what happened and whom to contact, except those locks.ts keeps open. Until
// subscription.get answers, or when it can't, the screen shows: hiding is a convenience, the api refuses the rest.
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useMe } from "@/session/me-context";
import { LockedScreen } from "./locked-screen";
import { lockOf, staysOpen } from "./locks";
import { useSubscription } from "./use-subscription";

export function SubscriptionGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const pathname = usePathname();
  const subscription = useSubscription();
  const lock = lockOf(subscription.data, subscription.error);
  if (lock === null || staysOpen(lock, { pathname, isOwner: me.member.role.isOwner })) return children;
  return <LockedScreen lock={lock} />;
}
