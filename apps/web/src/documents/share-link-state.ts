// Whether a share link still opens its document: active, expired, or turned off (revoked, which is for good).
import type { ShareLinkSummary } from "@travel-crm/contracts/share-links";
import type { StatusTone } from "@/components/status-badge";

export type ShareLinkState = "active" | "expired" | "revoked";

export function shareLinkState(
  link: Pick<ShareLinkSummary, "expiresAt" | "revokedAt">,
  now: Date = new Date(),
): ShareLinkState {
  if (link.revokedAt !== null) return "revoked";
  return link.expiresAt !== null && new Date(link.expiresAt) <= now ? "expired" : "active";
}

/** A working link is good news; one that no longer opens is neither good nor bad, just over. */
export const linkTones: Record<ShareLinkState, StatusTone> = { active: "good", expired: "neutral", revoked: "neutral" };
