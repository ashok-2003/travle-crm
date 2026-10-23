// Who a lead that arrived by itself goes to (release 4, spec 4.2), in order: a returning customer to their previous
// owner if they still work leads; then the first rule the lead matches whose person still does; then the agency's mode
// (the pool in turn, or the pool member with the fewest open leads). In the Owner mode the lead goes to the fallback,
// the agency's Owner; when the pool has nobody available, to no one: the Unassigned queue, which managers work.
// "Away" skips people in the turns only (the owner's answer): a previous owner or a rule's person gets the lead while
// away, and the answer says so. The pool's rows are locked while one is chosen, so two leads never take one turn.
import type { AssignedBy, LeadSource } from "@travel-crm/contracts/crm";
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
  /** When the lead arrived, for who is away. */
  now: Date;
}

/** Who the lead goes to (null: the Unassigned queue) and why. */
export interface Assignment extends AssignedBy {
  userId: string | null;
}

interface LockedMember {
  id: string;
  userId: string;
  /** Microseconds since 1970 (a Date keeps only milliseconds, and turns come closer than that); null: never had one. */
  lastTurnMicros: number | null;
}

/** Whether the person is in the pool and marked away at `now`: only the reason's note, never a reason to skip them. */
async function isAway(tx: OrgTx, userId: string, now: Date): Promise<boolean> {
  const member = await tx.assignmentPoolMember.findFirst({ where: { userId }, select: { awayUntil: true } });
  return member?.awayUntil != null && member.awayUntil > now;
}

async function decided(
  tx: OrgTx,
  context: AssignContext,
  userId: string,
  reason: "returning" | "rule" | "owner",
  rulePosition: number | null = null,
): Promise<Assignment> {
  return { userId, reason, rulePosition, away: await isAway(tx, userId, context.now) };
}

/** Open leads each of these people holds; read after the locks, so a lead the last arrival added is counted. */
async function openLeadCounts(tx: OrgTx, userIds: readonly string[]): Promise<Map<string, number>> {
  const rows = await tx.$queryRaw<{ userId: string; open: number }[]>(sql`
    SELECT lead.owner_user_id AS "userId", count(*)::int AS open FROM lead
    WHERE lead.owner_user_id = ANY(${userIds}::uuid[]) AND lead.deleted_at IS NULL
      AND lead.stage = ANY (ARRAY['new', 'contacted', 'quote_sent', 'booking_requested'])
    GROUP BY lead.owner_user_id`);
  return new Map(rows.map((row) => [row.userId, row.open]));
}

export async function chooseOwner(tx: OrgTx, lead: LeadFacts, context: AssignContext): Promise<Assignment> {
  const { workers, fallback, now } = context;
  if (lead.previousOwnerUserId !== null && workers.has(lead.previousOwnerUserId)) {
    return decided(tx, context, lead.previousOwnerUserId, "returning");
  }

  const rules = await tx.assignmentRule.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
  const matched = rules.find(
    (rule) =>
      workers.has(rule.assigneeUserId) &&
      (rule.source === null || rule.source === lead.source) &&
      (rule.destinationId === null || rule.destinationId === lead.destinationId) &&
      (rule.tripType === null || rule.tripType === lead.tripType),
  );
  if (matched) return decided(tx, context, matched.assigneeUserId, "rule", matched.position);

  const settings = await tx.assignmentSettings.findFirst({ select: { mode: true } });
  const mode = settings?.mode ?? "owner";
  if (mode === "owner") return decided(tx, context, fallback, "owner");

  // The pool, locked in a fixed order (no deadlock between two arrivals), skipping anyone away or gone.
  const locked = await tx.$queryRaw<LockedMember[]>(sql`
    SELECT member.id, member.user_id AS "userId", (extract(epoch FROM member.last_assigned_at) * 1000000)::float8 AS "lastTurnMicros"
    FROM assignment_pool_member member
    WHERE member.away_until IS NULL OR member.away_until <= ${now}::timestamptz
    ORDER BY member.id
    FOR UPDATE OF member`);
  const available = locked.filter((member) => workers.has(member.userId));
  const open =
    mode === "fewest_open"
      ? await openLeadCounts(
          tx,
          available.map((member) => member.userId),
        )
      : null;
  const waited = (member: LockedMember) => member.lastTurnMicros ?? Number.NEGATIVE_INFINITY;
  const [chosen] = [...available].sort(
    (first, second) =>
      (open === null ? 0 : (open.get(first.userId) ?? 0) - (open.get(second.userId) ?? 0)) ||
      (waited(first) === waited(second) ? 0 : waited(first) < waited(second) ? -1 : 1) ||
      (first.id < second.id ? -1 : 1),
  );
  if (chosen === undefined) return { userId: null, reason: "none", rulePosition: null, away: false };
  // The turn is stamped by the database's own clock, never the caller's: two workers with skewed clocks, or an import
  // dated in the past, can't write the wrong turn.
  await tx.$executeRaw(
    sql`UPDATE assignment_pool_member SET last_assigned_at = clock_timestamp() WHERE id = ${chosen.id}::uuid`,
  );
  return {
    userId: chosen.userId,
    reason: mode === "fewest_open" ? "fewest_open" : "turns",
    rulePosition: null,
    away: false,
  };
}
