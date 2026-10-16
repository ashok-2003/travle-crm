"use client";

// Whether a screen opens for this member today, as the subscription gate decides (subscription/locks.ts), so a link to
// one that is shut can be left out rather than lead to the locked screen: a suspended Owner on Documents has no way
// back to Settings, nor to Branding.
import { useMe } from "@/session/me-context";
import { lockOf, staysOpen } from "@/subscription/locks";
import { useSubscription } from "@/subscription/use-subscription";

export function useScreenOpen(pathname: string): boolean {
  const me = useMe();
  const { data, error } = useSubscription();
  const lock = lockOf(data, error);
  return lock === null || staysOpen(lock, { pathname, isOwner: me.member.role.isOwner });
}
