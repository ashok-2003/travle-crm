// Removing leads (the owner, 2026-11-01): one lead from its page or the list's chosen leads (leads:delete), and every
// lead at once from Settings, which only an Owner may do. A removed lead is soft-deleted (ADR 0004), so every list,
// count and search skips it, and its open follow-ups are cancelled. A lead with a quote or a booking is kept: those
// records point at it and carry money, so it is closed as Lost or Not a lead instead.
import type { RemovedLeads } from "@travel-crm/contracts/crm";
import { softDeleted, type Database, type OrgTx } from "@travel-crm/db";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { cancelOpenTasks, cancelOpenTasksOfRecords } from "../tasks/index.js";
import { recordCrmAudit } from "./crm-audit.js";
import { lockLead } from "./lead-core.js";
import { findLeadInScope } from "./lead-detail.js";

/** Leads removed in one transaction by removeAllLeads: small enough to finish well inside its time limit. */
const REMOVE_ALL_BATCH = 200;
const REMOVE_ALL_TIMEOUT = { timeout: 30_000 } as const;

/** A lead with these records is kept: they point at it. */
const withoutSales = { quotes: { none: {} }, bookings: { none: {} } } as const;

/** Removes one lead the member can see, cancelling its open follow-ups and tasks. */
export async function removeLead(tx: OrgTx, access: MemberAccess, leadId: string, now: Date): Promise<void> {
  const lead = await findLeadInScope(tx, access, leadId);
  const locked = await lockLead(tx, lead.id);
  const sales = await tx.lead.count({ where: { id: lead.id, NOT: withoutSales } });
  if (sales > 0) {
    throw new DomainError("CONFLICT", "LEAD_HAS_SALES", "A lead with a quote or a booking can't be removed");
  }
  await tx.lead.update({ where: { id: lead.id }, data: softDeleted(access.userId) });
  await cancelOpenTasks(tx, access, { recordType: "lead", recordId: lead.id }, now);
  await recordCrmAudit(tx, access, {
    entityType: "lead",
    action: "lead.deleted",
    entityId: lead.id,
    before: { stage: locked.stage, ownerUserId: locked.ownerUserId },
  });
}

/**
 * Removes every lead of the organization but those with a quote or a booking, in batches of their own transactions,
 * each lead audited. Only an Owner may. Returns how many were removed and how many were kept for their sales.
 */
export async function removeAllLeads(db: Pick<Database, "forOrg">, access: MemberAccess): Promise<RemovedLeads> {
  if (!access.role.isOwner) throw new DomainError("FORBIDDEN", "OWNER_ONLY", "Only an Owner removes every lead");
  let removed = 0;
  for (;;) {
    const batch = await db.forOrg(access.organizationId, (tx) => removeLeadBatch(tx, access), REMOVE_ALL_TIMEOUT);
    removed += batch;
    // A short batch was the last; one that removed nothing (every chosen lead got a quote meanwhile) ends it too.
    if (batch < REMOVE_ALL_BATCH) break;
  }
  const kept = await db.forOrg(access.organizationId, (tx) => tx.lead.count());
  return { removed, kept };
}

async function removeLeadBatch(tx: OrgTx, access: MemberAccess): Promise<number> {
  const chosen = await tx.lead.findMany({
    where: withoutSales,
    select: { id: true },
    orderBy: { id: "asc" },
    take: REMOVE_ALL_BATCH,
  });
  if (chosen.length === 0) return 0;
  const leads = await tx.lead.updateManyAndReturn({
    where: { id: { in: chosen.map((lead) => lead.id) }, ...withoutSales },
    data: softDeleted(access.userId),
    select: { id: true, stage: true, ownerUserId: true },
  });
  const now = new Date();
  await cancelOpenTasksOfRecords(
    tx,
    "lead",
    leads.map((lead) => lead.id),
    now,
  );
  for (const lead of leads) {
    await recordCrmAudit(tx, access, {
      entityType: "lead",
      action: "lead.deleted",
      entityId: lead.id,
      before: { stage: lead.stage, ownerUserId: lead.ownerUserId },
    });
  }
  return leads.length;
}
