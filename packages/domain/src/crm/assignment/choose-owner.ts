// Who a lead that arrived by itself goes to (release C, spec 3.2), in order: a returning customer to their previous
// owner if they still work leads; then the first rule the lead matches whose person still does; then the agency's mode
// (the pool in turn, or the pool member with the fewest open leads, skipping anyone away). In the Owner mode the lead
// goes to the fallback, the agency's Owner; when the pool has nobody available, to no one: the Unassigned queue, which
// managers work (spec 3.2). The pool's rows are locked while one is chosen, so two leads never take one turn.
import type { LeadSource } from "@travel-crm/contracts/crm";
import { sql, type OrgTx } from "@travel-crm/db";

export interface LeadFacts {
  source: LeadSource;
  destinationId: string | null;
  tripType: string | null;
  /** The owner of the person's latest earlier lead, for a returning customer. */
  previousOwnerUserId: string | null;
}

export interface AssignContext {
  /** Who can work leads now (identity's lead workers). */
  workers: ReadonlySet<string>;
  /** Who gets the lead when nothing else decides: the agency's Owner. */
  fallback: string;
  now: Date;
}

interface PoolRow {
  userId: string;
  lastAssignedAt: Date | null;
  open: number;
}

export async function chooseOwner(tx: OrgTx, lead: LeadFacts, context: AssignContext): Promise<string | null> {
  const { workers, fallback, now } = context;
  if (lead.previousOwnerUserId !== null && workers.has(lead.previousOwnerUserId)) return lead.previousOwnerUserId;

  const rules = await tx.assignmentRule.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
  const matched = rules.find(
    (rule) =>
      workers.has(rule.assigneeUserId) &&
      (rule.source === null || rule.source === lead.source) &&
      (rule.destinationId === null || rule.destinationId === lead.destinationId) &&
      (rule.tripType === null || rule.tripType === lead.tripType),
  );
  if (matched) return matched.assigneeUserId;

  const settings = await tx.assignmentSettings.findFirst({ select: { mode: true } });
  const mode = settings?.mode ?? "owner";
  if (mode === "owner") return fallback;
  // The pool, locked in a fixed order (no deadlock between two arrivals), skipping anyone away.
  const pool = await tx.$queryRaw<PoolRow[]>(sql`
    SELECT member.user_id AS "userId", member.last_assigned_at AS "lastAssignedAt",
      (SELECT count(*)::int FROM lead
        WHERE lead.owner_user_id = member.user_id AND lead.deleted_at IS NULL
          AND lead.stage = ANY (ARRAY['new', 'contacted', 'quote_sent', 'booking_requested'])) AS open
    FROM assignment_pool_member member
    WHERE member.away_until IS NULL OR member.away_until <= ${now}::timestamptz
    ORDER BY member.id
    FOR UPDATE OF member`);
  const waited = (member: PoolRow) => member.lastAssignedAt?.getTime() ?? 0;
  const [chosen] = pool
    .filter((member) => workers.has(member.userId))
    .sort((first, second) => (mode === "fewest_open" ? first.open - second.open : 0) || waited(first) - waited(second));
  if (chosen === undefined) return null;
  await tx.assignmentPoolMember.updateMany({ where: { userId: chosen.userId }, data: { lastAssignedAt: now } });
  return chosen.userId;
}
