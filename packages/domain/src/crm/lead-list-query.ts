// The lead list and its counts as composable SQL (R11), so the performance tests EXPLAIN exactly what runs: newest
// first, keyset on the id, over the partial indexes for open leads. Release 1's Task C3 builds them.
import type { LeadSource, LeadStage, TripType } from "@travel-crm/contracts/crm";
import type { Sql } from "@travel-crm/db";

/** What one page of the list asks for, its scope already applied. */
export interface LeadListFilter {
  /** Whose leads: one owner, or null for everyone. */
  ownerUserId: string | null;
  stages: readonly LeadStage[];
  source?: LeadSource;
  destinationId?: string;
  tripType?: TripType;
  /** A name (forgiving of typos) or four or more digits of a phone (R5). */
  search?: { kind: "name"; text: string } | { kind: "digits"; digits: string };
  /** The last lead id of the previous page. */
  before?: string;
  limit: number;
}

/** The counts' filter: the list's, without the stage and the page. */
export type LeadCountsFilter = Omit<LeadListFilter, "stages" | "before" | "limit">;

/** One page of the list's rows. */
export const leadListQuery: (filter: LeadListFilter) => Sql = () => {
  throw new Error("Not built yet: release 1 plan, Task C3");
};

/** Open leads counted by stage. */
export const leadCountsQuery: (filter: LeadCountsFilter) => Sql = () => {
  throw new Error("Not built yet: release 1 plan, Task C3");
};
