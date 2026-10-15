// Exports before permanent deletion (spec 5: "export, typed confirmation, purge job"): everything an organization
// keeps, or what it keeps about one person or record. Each export is logged; a purge or an erasure needs one from the
// last day.
import type { ErasureSubject, OrganizationExport, SubjectExport } from "@travel-crm/contracts/platform";
import { organizationRows, asOrganization, type PlatformTx } from "@travel-crm/db/platform";
import { auditEntriesAbout } from "../audit/index.js";
import { exportedFiles } from "../files/index.js";
import { findOrganizationRecord, personExport } from "../identity/index.js";
import { recordPlatformAudit, type PlatformActor } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** Download links in an export work for a day. */
const EXPORT_LINK_SECONDS = 24 * 60 * 60;

/** Tables of the workings, not of the organization's data. */
const INTERNAL_TABLES = ["outbox_event", "processed_event", "push_subscription"];

/** An export of everything this long ago or less counts for a purge or an erasure. */
export const EXPORT_VALID_FOR_MS = 24 * 60 * 60 * 1000;

/** The record an erasure subject names, as the audit log and files know it. */
export function subjectRecord(subject: ErasureSubject): { recordType: string; recordId: string } {
  return subject.kind === "member"
    ? { recordType: "member", recordId: subject.memberId }
    : { recordType: subject.recordType, recordId: subject.recordId };
}

export async function exportOrganization(
  services: PlatformServices,
  staff: PlatformActor,
  organizationId: string,
): Promise<OrganizationExport> {
  return services.platformDb.transaction(
    async (tx) => {
      await findOrganizationRecord(tx, organizationId);
      const tables = await organizationRows(tx, organizationId, { except: INTERNAL_TABLES });
      const people = [];
      for (const member of tables.member ?? []) {
        people.push(await personExport(tx, organizationId, (member as { id: string }).id));
      }
      const files = await exportedFiles(tx, services.storage, { organizationId }, EXPORT_LINK_SECONDS);
      await recordPlatformAudit(tx, staff, {
        action: "organization.exported",
        targetType: "organization",
        targetId: organizationId,
        targetOrganizationId: organizationId,
        after: { tables: Object.keys(tables).length, people: people.length, files: files.length },
      });
      return { exportedAt: new Date().toISOString(), organizationId, tables, people, files };
    },
    { timeout: 60_000 },
  );
}

export async function exportSubject(
  services: PlatformServices,
  staff: PlatformActor,
  input: { organizationId: string; subject: ErasureSubject },
): Promise<SubjectExport> {
  const { organizationId, subject } = input;
  const record = subjectRecord(subject);
  return services.platformDb.transaction(async (tx) => {
    await findOrganizationRecord(tx, organizationId);
    const person = subject.kind === "member" ? await personExport(tx, organizationId, subject.memberId) : null;
    const auditEntries = await asOrganization(tx, organizationId, (orgTx) =>
      auditEntriesAbout(orgTx, { organizationId, entityType: record.recordType, entityId: record.recordId }),
    );
    const files = await exportedFiles(tx, services.storage, { organizationId, ...record }, EXPORT_LINK_SECONDS);
    await recordPlatformAudit(tx, staff, {
      action: "subject.exported",
      targetType: record.recordType,
      targetId: record.recordId,
      targetOrganizationId: organizationId,
      after: { auditEntries: auditEntries.length, files: files.length },
    });
    return { exportedAt: new Date().toISOString(), person, auditEntries, files };
  });
}

/** Whether `action` was logged for the target within the last day. */
export async function exportedRecently(tx: PlatformTx, action: string, targetId: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - EXPORT_VALID_FOR_MS);
  return (await tx.platformAuditEntry.count({ where: { action, targetId, occurredAt: { gte: since } } })) > 0;
}
