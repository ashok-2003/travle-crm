// Today (spec 3.5): the signed-in person's own overdue and due-today follow-ups and tasks and their new leads waiting
// for a reply, counted for the day in the agency's zone (R35). Release 1's Task S1 builds them.
import type { TodaySectionInput, TodaySectionPage, TodaySummary } from "@travel-crm/contracts/today";
import type { OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";

/** The day, the three counts and the top three items. */
export const todaySummary: (tx: OrgTx, access: MemberAccess, now: Date) => Promise<TodaySummary> = () => {
  throw new Error("Not built yet: release 1 plan, Task S1");
};

/** One section, a page at a time. */
export const todaySection: (
  tx: OrgTx,
  access: MemberAccess,
  input: TodaySectionInput,
  now: Date,
) => Promise<TodaySectionPage> = () => {
  throw new Error("Not built yet: release 1 plan, Task S1");
};
