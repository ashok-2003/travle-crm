// A member's use of the product (the owner, 2026-10-28): each page they open becomes a visit, its seconds kept up to
// date while it stays open, so the platform console can say who used it, when, where and for how long. The route only,
// its ids already replaced by the app; support impersonating a member is not counted.
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** A page left open this long is counted no further: a forgotten tab isn't use. */
const MOST_SECONDS = 4 * 3600;

export async function trackVisit(
  tx: OrgTx,
  access: MemberAccess,
  input: { visitId?: string | undefined; path: string; seconds: number },
): Promise<{ visitId: string | null }> {
  if (access.impersonatedBy !== null) return { visitId: null };
  const seconds = Math.min(input.seconds, MOST_SECONDS);
  if (input.visitId !== undefined) {
    // Only the member's own visit moves, and never back.
    const moved = await tx.pageVisit.updateMany({
      where: { id: input.visitId, userId: access.userId, seconds: { lte: seconds } },
      data: { seconds },
    });
    if (moved.count === 1) return { visitId: input.visitId };
  }
  const visit = await tx.pageVisit.create({
    data: { userId: access.userId, path: input.path, seconds },
    select: { id: true },
  });
  return { visitId: visit.id };
}
