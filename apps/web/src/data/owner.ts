// Whose organization data a page holds: the person and organization me.get names. The saved copy records it, so a
// copy is restored only for that person, and a page drops what it holds the moment me.get names someone else.
import type { MeOutput } from "@travel-crm/contracts/identity";

export interface CopyOwner {
  userId: string;
  /** Null for platform staff, who belong to no organization. */
  organizationId: string | null;
}

export function ownerOf(me: Pick<MeOutput, "user" | "organization">): CopyOwner {
  return { userId: me.user.id, organizationId: me.organization?.id ?? null };
}

export function sameOwner(first: CopyOwner, second: CopyOwner): boolean {
  return first.userId === second.userId && first.organizationId === second.organizationId;
}

/** Whether data from the cache is a me.get answer, so its owner can be read. */
export function isMeAnswer(data: unknown): data is Pick<MeOutput, "user" | "organization"> {
  if (data === null || typeof data !== "object") return false;
  const { user, organization } = data as { user?: { id?: unknown }; organization?: { id?: unknown } | null };
  return typeof user?.id === "string" && (organization === null || typeof organization?.id === "string");
}
