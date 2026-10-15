// The platform log (spec 5, 7): what platform staff did in the console, and what the platform's own jobs did,
// written in the same platform transaction as the change. Append-only, and kept after the organization it names.
import type { ListPlatformLogInput, PlatformLogEntry, PlatformLogPage } from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";
import { assertAuditable, type AuditSnapshot } from "../audit/index.js";

/** Who acts on the platform: a platform admin by user id, or null for the platform's own jobs. */
export interface PlatformActor {
  readonly userId: string | null;
}

/** One change to record. Snapshots follow the organizations' log: the fields that changed, never secrets. */
export interface PlatformChange {
  /** "<entity>.<what happened>", e.g. "organization.onboarded". */
  action: string;
  /** The kind of thing acted on, e.g. "organization", "plan", "platform_staff" or "job". */
  targetType: string;
  /** Its id: a UUID, or for jobs a queue name or a job id. */
  targetId: string;
  /** The organization the change concerns, when there is one. */
  targetOrganizationId?: string | null;
  before?: AuditSnapshot | null;
  after?: AuditSnapshot | null;
}

const TARGET_TYPE_PATTERN = /^[a-z][a-z_]{1,39}$/;
const MAX_TARGET_ID_LENGTH = 200;

export async function recordPlatformAudit(tx: PlatformTx, actor: PlatformActor, change: PlatformChange): Promise<void> {
  assertAuditable(change);
  if (!TARGET_TYPE_PATTERN.test(change.targetType)) {
    throw new RangeError(`Platform log targets look like "organization", got ${JSON.stringify(change.targetType)}`);
  }
  if (change.targetId === "" || change.targetId.length > MAX_TARGET_ID_LENGTH) {
    throw new RangeError(`A platform log target id has 1 to ${String(MAX_TARGET_ID_LENGTH)} characters`);
  }
  await tx.platformAuditEntry.create({
    data: {
      actorUserId: actor.userId,
      action: change.action,
      targetType: change.targetType,
      targetId: change.targetId,
      targetOrganizationId: change.targetOrganizationId ?? null,
      // Left out rather than null: the column stays SQL NULL, "no state on this side".
      ...(change.before ? { before: change.before } : {}),
      ...(change.after ? { after: change.after } : {}),
    },
  });
}

/** The log newest first, a page at a time; optionally one organization's entries. */
export async function listPlatformLog(tx: PlatformTx, input: ListPlatformLogInput): Promise<PlatformLogPage> {
  const rows = await tx.platformAuditEntry.findMany({
    where: input.targetOrganizationId ? { targetOrganizationId: input.targetOrganizationId } : {},
    // Entries written in one transaction share its time; the id (UUID v7) orders them and makes the order total.
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    ...(input.before ? { cursor: { id: input.before }, skip: 1 } : {}),
    take: input.limit + 1,
  });
  const page = rows.slice(0, input.limit);
  return {
    entries: page.map((row): PlatformLogEntry => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      actorUserId: row.actorUserId,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetOrganizationId: row.targetOrganizationId,
      before: snapshotOf(row.before),
      after: snapshotOf(row.after),
    })),
    nextCursor: rows.length > input.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/** The table's checks keep snapshots to JSON objects or NULL. */
function snapshotOf(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : null;
}
