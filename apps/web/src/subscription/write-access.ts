"use client";

// Whether a write may go ahead in the organization's lifecycle state today, for showing a button disabled with the
// reason (ADR 0021). It answers as request check 2 does (packages/domain/src/subscriptions/request-rules.ts, whose
// every row a test compares with this): read-only allows exports and revoking access, suspended only the Owner's,
// cancelled nothing. A convenience: the api checks every call itself.
import type { SubscriptionOverview } from "@travel-crm/contracts/subscriptions";
import { useTranslations } from "next-intl";
import { useMe } from "@/session/me-context";
import { useSubscription } from "./use-subscription";

/** A change, taking someone's access away (removing staff, a new password), or an export of the organization's data. */
export type WriteKind = "change" | "revoke" | "export";

export type LifecycleRefusal = "ORGANIZATION_READ_ONLY" | "ORGANIZATION_SUSPENDED" | "ORGANIZATION_CANCELLED";

/** What check 2 would answer (packages/domain/src/subscriptions/request-rules.ts), from subscription.get. */
export function writeAccessOf(
  overview: SubscriptionOverview | undefined,
  call: { kind: WriteKind; isOwner: boolean },
): { allowed: true; reason: null } | { allowed: false; reason: LifecycleRefusal } {
  const allowed = { allowed: true, reason: null } as const;
  switch (overview?.access) {
    case undefined:
    case "full":
      return allowed;
    case "read_only":
      return call.kind === "change" ? { allowed: false, reason: "ORGANIZATION_READ_ONLY" } : allowed;
    case "export_only":
      return call.kind !== "change" && call.isOwner ? allowed : { allowed: false, reason: "ORGANIZATION_SUSPENDED" };
    case "locked":
      return { allowed: false, reason: "ORGANIZATION_CANCELLED" };
  }
}

/** For a button: allowed, or the sentence saying why not. Allowed while subscription.get loads: the api decides. */
export function useWriteAccess(kind: WriteKind = "change"): { allowed: boolean; hint: string | null } {
  const t = useTranslations("errors.reasons");
  const me = useMe();
  const { data } = useSubscription();
  const access = writeAccessOf(data, { kind, isOwner: me.member.role.isOwner });
  return access.allowed ? { allowed: true, hint: null } : { allowed: false, hint: t(access.reason) };
}
