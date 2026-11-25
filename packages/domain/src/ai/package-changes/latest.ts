// What the trip page shows after an AI apply: the trip's latest applied run, how many changes it applied, and whether
// Undo all is still offered (only while the trip is exactly as the apply left it). Nothing once it was undone.
import type { LatestPackageChangeRun } from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { findPackage } from "../../quotes/index.js";
import { latestAppliedRun, proposalOf, stampNow } from "./runs.js";

export async function latestPackageChangeRun(
  tx: OrgTx,
  packageId: string,
  now: Date = new Date(),
): Promise<LatestPackageChangeRun> {
  const trip = await findPackage(tx, packageId);
  const run = await latestAppliedRun(tx, trip.id);
  if (run?.status !== "applied" || run.appliedAt === null) return null;
  const stamp = await stampNow(tx, trip.id, proposalOf(run).from, now);
  return {
    runId: run.id,
    appliedAt: run.appliedAt,
    applied: run.appliedChangeIds.length,
    undoable: stamp === run.stampAfter,
  };
}
