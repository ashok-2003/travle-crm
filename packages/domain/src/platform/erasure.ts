// Erasing one person or record on a DPDP request passed on by the organization (spec 5): a super admin asks, with the
// organization's code typed and an export from the last day; the console's job then erases it, module by module, and
// records it in the organization's log and the platform's, without the personal data. Only a removed member, or a
// record that holds a person's data, can be erased (deletion-checks.ts).
import { randomUUID } from "node:crypto";
import type { ErasureSubject, QueuedJob, RequestErasureInput } from "@travel-crm/contracts/platform";
import { erasureSubject } from "@travel-crm/contracts/platform";
import type { JobData } from "@travel-crm/integrations/jobs";
import { recordAudit, redactAuditEntries } from "../audit/index.js";
import { deleteRecordFiles } from "../files/index.js";
import { erasePerson, findOrganizationRecord, personExport } from "../identity/index.js";
import { DomainError, isUuid, platformActor, systemActor } from "../kernel/index.js";
import { forgetRecipient, forgetRecordNotifications } from "../notifications/index.js";
import { forgetRecordShareLinks } from "../share-links/index.js";
import { tombstoneWebhookEvents } from "../webhooks/index.js";
import { assertErasableRecordType, erasedFor, erasureBlocker } from "./deletion-checks.js";
import { subjectRecord } from "./exports.js";
import { deleteFilesAfterCommit } from "./file-deletions.js";
import { expireOrganizationExports } from "./merge-stand-ins.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

export const ERASE_SUBJECT_QUEUE = "platform.erase-subject";

/** An erasure job: who or what, who asked, and the request (its job's id), so a repeat run is recognised. */
export interface ErasureJob {
  organizationId: string;
  subject: ErasureSubject;
  requestedBy: string | null;
  requestId?: string;
}

/** The job's data: flat, ids only (job data has no row-level security). */
function jobDataOf(organizationId: string, subject: ErasureSubject, requestedBy: string, requestId: string): JobData {
  return subject.kind === "member"
    ? { organizationId, kind: "member", memberId: subject.memberId, requestedBy, requestId }
    : {
        organizationId,
        kind: "record",
        recordType: subject.recordType,
        recordId: subject.recordId,
        requestedBy,
        requestId,
      };
}

/** Reads a job's data back, refusing anything malformed: a bug, so the job fails loudly. */
export function erasureJobOf(data: JobData): ErasureJob & { requestedBy: string; requestId: string } {
  const { organizationId, requestedBy, requestId, kind, memberId, recordType, recordId } = data;
  if (
    typeof organizationId !== "string" ||
    typeof requestedBy !== "string" ||
    typeof requestId !== "string" ||
    !isUuid(requestId)
  ) {
    throw new TypeError("An erasure job needs organizationId, requestedBy and requestId");
  }
  return {
    organizationId,
    requestedBy,
    requestId,
    subject: erasureSubject.parse(kind === "member" ? { kind, memberId } : { kind, recordType, recordId }),
  };
}

export async function requestErasure(
  services: PlatformServices,
  staff: { userId: string },
  input: RequestErasureInput,
  now: Date = new Date(),
): Promise<QueuedJob> {
  if (input.subject.kind === "record") assertErasableRecordType(input.subject.recordType);
  const record = subjectRecord(input.subject);
  await services.platformDb.transaction(async (tx) => {
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
    if ((await erasureBlocker(tx, input.organizationId, record, now)) !== null) {
      throw new DomainError("CONFLICT", "EXPORT_FIRST", "Export what is kept about them first (within the last day)");
    }
    await recordPlatformAudit(tx, staff, {
      action: "subject.erasure-requested",
      targetType: record.recordType,
      targetId: record.recordId,
      targetOrganizationId: input.organizationId,
    });
  });
  // Queued once the request is recorded, so no job runs without one.
  const jobId = randomUUID();
  await services.queue.send(ERASE_SUBJECT_QUEUE, jobDataOf(input.organizationId, input.subject, staff.userId, jobId), {
    id: jobId,
  });
  return { jobId };
}

/**
 * The job: erases the subject in every module that keeps something about it, in one platform transaction. For a
 * member: identity's sign-in data, their notifications, opt-outs and browsers. For either: the record's files, its share
 * links and their opens, the notifications about it, its audit entries' snapshots, and the organization's processed
 * webhook payloads (any may quote the person, and none is needed once processed). Then every stored export of the
 * organization expires, since one may still hold the person. Stored files go after the commit, through the deletions'
 * outbox.
 *
 * It checks the request's conditions again first, on the platform transaction before any step: an organization gone
 * since, or a subject export over a day old by now, means nothing is erased, and "subject.erasure-skipped" says why.
 * A run repeating its request's finished one (the job ran, but pg-boss never heard) only finishes the files.
 */
export async function eraseSubject(services: PlatformServices, job: ErasureJob, now: Date = new Date()): Promise<void> {
  const { organizationId, subject } = job;
  if (subject.kind === "record") assertErasableRecordType(subject.recordType);
  const record = subjectRecord(subject);
  const erased = await services.platformDb.transaction(async (tx) => {
    if (job.requestId !== undefined && (await erasedFor(tx, organizationId, job.requestId))) return true;
    const blocker = await erasureBlocker(tx, organizationId, record, now);
    if (blocker !== null) {
      await recordPlatformAudit(
        tx,
        { userId: job.requestedBy },
        {
          action: "subject.erasure-skipped",
          targetType: record.recordType,
          targetId: record.recordId,
          targetOrganizationId: organizationId,
          after: { reason: blocker },
        },
      );
      return false;
    }
    if (subject.kind === "member") {
      const { userId } = await erasePerson(tx, organizationId, subject.memberId);
      await forgetRecipient(tx, { organizationId, userId });
    }
    const files = await deleteRecordFiles(tx, { organizationId, ...record }, now);
    const shareLinks = await forgetRecordShareLinks(tx, { organizationId, ...record });
    const notifications = await forgetRecordNotifications(tx, {
      organizationId,
      recordId: record.recordId,
      sourceEventIds: shareLinks.openedEventIds,
    });
    const redacted = await redactAuditEntries(tx, {
      organizationId,
      entityType: record.recordType,
      entityId: record.recordId,
    });
    const webhooks = await tombstoneWebhookEvents(tx, organizationId);
    await expireOrganizationExports(services, tx, organizationId, "erasure");
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
          ...(job.requestId === undefined ? {} : { requestId: job.requestId }),
          files,
          shareLinks: shareLinks.shareLinks,
          shareLinkOpens: shareLinks.opens,
          notifications,
          auditEntriesRedacted: redacted,
          webhooksTombstoned: webhooks.tombstoned,
          webhooksWaiting: webhooks.waiting,
        },
      },
    );
    return true;
  });
  if (erased) await deleteFilesAfterCommit(services, organizationId, now);
}
