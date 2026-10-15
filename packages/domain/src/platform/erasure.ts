// Erasing one person or record on a DPDP request passed on by the organization (spec 5): a super admin asks, with the
// organization's code typed and an export from the last day; the console's job then erases it, module by module, and
// records it in the organization's log and the platform's, without the personal data.
import { randomUUID } from "node:crypto";
import type { ErasureSubject, QueuedJob, RequestErasureInput } from "@travel-crm/contracts/platform";
import { erasureSubject } from "@travel-crm/contracts/platform";
import type { JobData } from "@travel-crm/integrations/jobs";
import { recordAudit, redactAuditEntries } from "../audit/index.js";
import { deleteRecordFiles, deleteStoredFiles } from "../files/index.js";
import { erasePerson, findOrganizationRecord, personExport } from "../identity/index.js";
import { DomainError, platformActor, systemActor } from "../kernel/index.js";
import { forgetRecipient } from "../notifications/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import { exportedRecently, subjectRecord } from "./exports.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export const ERASE_SUBJECT_QUEUE = "platform.erase-subject";

/** The job's data: flat, ids only (job data has no row-level security). */
function jobDataOf(organizationId: string, subject: ErasureSubject, requestedBy: string): JobData {
  return subject.kind === "member"
    ? { organizationId, kind: "member", memberId: subject.memberId, requestedBy }
    : { organizationId, kind: "record", recordType: subject.recordType, recordId: subject.recordId, requestedBy };
}

/** Reads a job's data back, refusing anything malformed: a bug, so the job fails loudly. */
export function erasureJobOf(data: JobData): { organizationId: string; subject: ErasureSubject; requestedBy: string } {
  const { organizationId, requestedBy, kind, memberId, recordType, recordId } = data;
  if (typeof organizationId !== "string" || typeof requestedBy !== "string") {
    throw new TypeError("An erasure job needs organizationId and requestedBy");
  }
  return {
    organizationId,
    requestedBy,
    subject: erasureSubject.parse(kind === "member" ? { kind, memberId } : { kind, recordType, recordId }),
  };
}

export async function requestErasure(
  services: PlatformServices,
  staff: { userId: string },
  input: RequestErasureInput,
  now: Date = new Date(),
): Promise<QueuedJob> {
  const record = subjectRecord(input.subject);
  return services.platformDb.transaction(async (tx) => {
    const organization = await findOrganizationRecord(tx, input.organizationId);
    if (input.confirmation !== organization.code) {
      throw new DomainError("VALIDATION", "CONFIRMATION_MISMATCH", "Type the organization's code to confirm");
    }
    if (input.subject.kind === "member") {
      const person = await personExport(tx, input.organizationId, input.subject.memberId);
      if (person.removedAt === null) {
        throw new DomainError(
          "CONFLICT",
          "REMOVE_FIRST",
          "Remove this person from the organization before erasing them",
        );
      }
    }
    if (!(await exportedRecently(tx, "subject.exported", record.recordId, now, input.organizationId))) {
      throw new DomainError("CONFLICT", "EXPORT_FIRST", "Export what is kept about them first (within the last day)");
    }
    await recordPlatformAudit(tx, staff, {
      action: "subject.erasure-requested",
      targetType: record.recordType,
      targetId: record.recordId,
      targetOrganizationId: input.organizationId,
    });
    const jobId = randomUUID();
    await services.queue.send(ERASE_SUBJECT_QUEUE, jobDataOf(input.organizationId, input.subject, staff.userId), {
      id: jobId,
    });
    return { jobId };
  });
}

/**
 * The job: erases the subject in every module that keeps something about it, in one platform transaction, then
 * deletes its stored files. For a member: identity's sign-in data, their notifications, opt-outs and browsers; for
 * either: the record's files, its audit entries' snapshots, and the organization's processed webhook payloads (they may
 * quote the person). Safe to run again.
 */
export async function eraseSubject(
  services: PlatformServices,
  job: { organizationId: string; subject: ErasureSubject; requestedBy: string | null },
): Promise<void> {
  const { organizationId, subject } = job;
  const record = subjectRecord(subject);
  const keys = await services.platformDb.transaction(async (tx) => {
    if (subject.kind === "member") {
      const { userId } = await erasePerson(tx, organizationId, subject.memberId);
      await forgetRecipient(tx, { organizationId, userId });
    }
    const fileKeys = await deleteRecordFiles(tx, { organizationId, ...record });
    const redacted = await redactAuditEntries(tx, {
      organizationId,
      entityType: record.recordType,
      entityId: record.recordId,
    });
    const webhooks = await tombstoneWebhookEvents(tx, organizationId);
    const actor =
      job.requestedBy === null ? systemActor(organizationId) : platformActor(organizationId, job.requestedBy);
    await recordAudit(tx, actor, {
      action: "subject.erased",
      entityType: record.recordType,
      entityId: record.recordId,
    });
    await recordPlatformAudit(
      tx,
      { userId: job.requestedBy },
      {
        action: "subject.erased",
        targetType: record.recordType,
        targetId: record.recordId,
        targetOrganizationId: organizationId,
        after: {
          files: fileKeys.length,
          auditEntriesRedacted: redacted,
          webhooksTombstoned: webhooks.tombstoned,
          webhooksWaiting: webhooks.waiting,
        },
      },
    );
    return fileKeys;
  });
  await deleteStoredFiles(services.storage, keys);
}
