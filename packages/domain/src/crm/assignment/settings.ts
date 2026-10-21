// The agency's assignment settings (release C): read for the settings screen, and saved whole by whoever manages
// settings (the rules replaced in their new order, the pool set to exactly the people given), audited. Each person in
// the pool marks themselves away and back.
import {
  assignmentMode,
  leadSource,
  tripType,
  type AssignmentSettings,
  type PoolPlace,
  type SaveAssignmentInput,
  type SetAwayInput,
} from "@travel-crm/contracts/crm";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../../audit/index.js";
import { destinationNames } from "../../catalog/index.js";
import type { MemberAccess } from "../../identity/index.js";
import { DomainError } from "../../kernel/index.js";

export async function readAssignment(tx: OrgTx): Promise<AssignmentSettings> {
  const settings = await tx.assignmentSettings.findFirst();
  const rules = await tx.assignmentRule.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] });
  const pool = await tx.assignmentPoolMember.findMany({ orderBy: { id: "asc" } });
  const names = await destinationNames(
    tx,
    rules.flatMap((rule) => (rule.destinationId === null ? [] : [rule.destinationId])),
  );
  return {
    // The columns' CHECKs hold these values; parsing names the type without a cast.
    mode: assignmentMode.parse(settings?.mode ?? "owner"),
    slowReplyMinutes: settings?.slowReplyMinutes ?? null,
    rules: rules.map((rule) => ({
      id: rule.id,
      source: rule.source === null ? null : leadSource.parse(rule.source),
      destinationId: rule.destinationId,
      destinationName: rule.destinationId === null ? null : (names.get(rule.destinationId) ?? null),
      tripType: rule.tripType === null ? null : tripType.parse(rule.tripType),
      assigneeUserId: rule.assigneeUserId,
    })),
    pool: pool.map((member) => ({ userId: member.userId, awayUntil: member.awayUntil?.toISOString() ?? null })),
  };
}

export async function saveAssignment(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveAssignmentInput,
  workers: ReadonlySet<string>,
): Promise<void> {
  const people = [...input.rules.map((rule) => rule.assigneeUserId), ...input.pool];
  if (people.some((userId) => !workers.has(userId))) {
    throw new DomainError("VALIDATION", "NOT_A_LEAD_WORKER", "That person can't work leads");
  }
  const before = await readAssignment(tx);
  const settings = { mode: input.mode, slowReplyMinutes: input.slowReplyMinutes, updatedBy: access.userId };
  const existing = await tx.assignmentSettings.findFirst({ select: { id: true } });
  if (existing) await tx.assignmentSettings.update({ where: { id: existing.id }, data: settings });
  else await tx.assignmentSettings.create({ data: settings });

  await tx.assignmentRule.deleteMany({});
  await tx.assignmentRule.createMany({ data: input.rules.map((rule, position) => ({ position, ...rule })) });

  const pool = new Set(input.pool);
  await tx.assignmentPoolMember.deleteMany({ where: { userId: { notIn: [...pool] } } });
  const kept = new Set((await tx.assignmentPoolMember.findMany({ select: { userId: true } })).map((row) => row.userId));
  await tx.assignmentPoolMember.createMany({
    data: [...pool].filter((userId) => !kept.has(userId)).map((userId) => ({ userId })),
  });

  await recordAudit(tx, access, {
    action: "assignment.updated",
    entityType: "assignment_settings",
    entityId: access.organizationId,
    before: { mode: before.mode, rules: before.rules.length, pool: before.pool.length },
    after: { mode: input.mode, rules: input.rules.length, pool: input.pool.length },
  });
}

/** Whether the person takes new leads in turn, and until when they are away (null when not). */
export async function poolPlaceOf(tx: OrgTx, access: MemberAccess): Promise<PoolPlace> {
  const member = await tx.assignmentPoolMember.findFirst({
    where: { userId: access.userId },
    select: { awayUntil: true },
  });
  return { inPool: member !== null, awayUntil: member?.awayUntil?.toISOString() ?? null };
}

/** Marks the person away from the pool until a time, or back; someone not in the pool is told so. */
export async function setAway(tx: OrgTx, access: MemberAccess, input: SetAwayInput): Promise<void> {
  const { count } = await tx.assignmentPoolMember.updateMany({
    where: { userId: access.userId },
    data: { awayUntil: input.awayUntil === null ? null : new Date(input.awayUntil) },
  });
  if (count === 0) throw new DomainError("NOT_FOUND", "NOT_IN_POOL", "You don't take new leads in turn");
}
