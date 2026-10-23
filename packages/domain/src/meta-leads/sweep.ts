// The console's sweep of the Meta lead ads (spec 5): a Page chosen at Facebook and never confirmed is let go after a day,
// its sealed token deleted. Runs in a platform transaction, a page of them at a time, naming what it changes.
import type { OrgTx } from "@travel-crm/db";
import { draftLifetimeHours } from "./limits.js";
import { clearedToken } from "./tokens.js";

const HOUR_MS = 60 * 60 * 1000;

export interface MetaSwept {
  draftsLetGo: number;
}

/** One page of drafts: at most `limit`. Run again until a page comes back short. */
export async function sweepMeta(tx: OrgTx, now: Date, limit: number): Promise<MetaSwept> {
  const drafts = await tx.metaPage.findMany({
    where: { status: "connecting", createdAt: { lt: new Date(now.getTime() - draftLifetimeHours * HOUR_MS) } },
    select: { id: true, organizationId: true },
    take: limit,
    orderBy: { id: "asc" },
  });
  for (const draft of drafts) {
    await tx.metaPage.updateMany({
      where: { id: draft.id, organizationId: draft.organizationId, status: "connecting" },
      data: { status: "disconnected", disconnectedAt: now, ...clearedToken },
    });
  }
  return { draftsLetGo: drafts.length };
}
