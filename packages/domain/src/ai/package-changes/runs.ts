// A change run as Apply, Undo all and the trip page read it: its stored proposal and before-values read back, and the
// check that the trip is still as the run saw it (its stamp, read over the same days of departures).
import {
  packageChangeRunBefore,
  storedPackageChangeProposal,
  type PackageChangeRunBefore,
  type StoredPackageChangeProposal,
} from "@travel-crm/contracts/ai";
import type { OrgTx } from "@travel-crm/db";
import { DomainError, parseCalendarDate } from "../../kernel/index.js";
import { refuse } from "../refusals.js";
import { tripSnapshot, tripStamp } from "./trip-snapshot.js";

const notFound = () => new DomainError("NOT_FOUND", "NOT_FOUND", "Not found");

/** The run's proposal as stored; a row that doesn't read is no run. */
export function proposalOf(run: { proposal: unknown }): StoredPackageChangeProposal {
  const parsed = storedPackageChangeProposal.safeParse(run.proposal);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

/** What the applied run replaced; a row that doesn't read is no run to undo. */
export function beforeOf(run: { before: unknown }): PackageChangeRunBefore {
  const parsed = packageChangeRunBefore.safeParse(run.before);
  if (!parsed.success) throw notFound();
  return parsed.data;
}

/** The trip's stamp now, over the days of departures the run read. */
export async function stampNow(tx: OrgTx, packageId: string, from: string, now: Date): Promise<string> {
  return tripStamp(await tripSnapshot(tx, packageId, parseCalendarDate(from), now));
}

/** Refuses unless the trip is exactly as the run saw it. */
export async function assertUnchanged(tx: OrgTx, packageId: string, from: string, stamp: string | null, now: Date) {
  if (stamp === null || (await stampNow(tx, packageId, from, now)) !== stamp) {
    throw refuse("TRIP_CHANGED_SINCE", "This trip changed since: show the changes again");
  }
}

/**
 * The trip's latest applied run (applied or since undone), with what Undo all reads. Two applied at the same moment are
 * told apart by their last write.
 */
export const latestAppliedRun = (tx: OrgTx, packageId: string) =>
  tx.packageChangeRun.findFirst({
    where: { templateId: packageId, appliedAt: { not: null } },
    orderBy: [{ appliedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      status: true,
      proposal: true,
      before: true,
      stampAfter: true,
      appliedAt: true,
      appliedChangeIds: true,
    },
  });
