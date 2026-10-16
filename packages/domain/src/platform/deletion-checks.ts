// What an erasure checks before it deletes anything (spec 5), both when a super admin asks and again in the job: its
// organization still there, a fresh export of the subject, a record that holds personal data and that the system
// doesn't keep by law, and whether the job already did its work. Every read here runs on the platform transaction
// itself, never inside an asOrganization step, which sees only its organization and could find too little.
import type { PlatformTx } from "@travel-crm/db/platform";
import { findOrganizationRecord } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";
import { exportedRecently } from "./exports.js";

/** Why an erasure can't go ahead now: the request refuses, and the job skips and logs it. */
export type ErasureBlocker = "organization-gone" | "no-recent-export";

/**
 * What stands in an erasure's way: its organization must still exist, and the subject (its record type and id) be
 * exported within a day.
 */
export async function erasureBlocker(
  tx: PlatformTx,
  organizationId: string,
  record: { recordType: string; recordId: string },
  now: Date,
): Promise<ErasureBlocker | null> {
  try {
    await findOrganizationRecord(tx, organizationId);
  } catch (error) {
    if (error instanceof DomainError && error.reason === "ORGANIZATION_NOT_FOUND") return "organization-gone";
    throw error;
  }
  const target = { targetType: record.recordType, targetId: record.recordId };
  const exported = await exportedRecently(tx, "subject.exported", target, now, organizationId);
  return exported ? null : "no-recent-export";
}

/** Whether a request's erasure is already recorded: its job's id is in the platform log's `subject.erased` entry. */
export async function erasedFor(tx: PlatformTx, organizationId: string, requestId: string): Promise<boolean> {
  const count = await tx.platformAuditEntry.count({
    where: {
      action: "subject.erased",
      targetOrganizationId: organizationId,
      after: { path: ["requestId"], equals: requestId },
    },
  });
  return count > 0;
}

/**
 * The record types an erasure may name (a member is erased as a member): the records that hold a person's data. Spec
 * 5 names the traveller; release 1 adds crm's customer, the "person" (its erasure step is crm's eraseCustomer). A
 * module whose records hold personal data adds its type here with its own erasure step.
 */
const PERSONAL_RECORD_TYPES: readonly string[] = ["traveller", "person"];

/** Records the system keeps as they were made, by law: an issued document is a GST invoice or its like (ADR 0012). */
const KEPT_BY_LAW_RECORD_TYPES: readonly string[] = ["issued_document"];

/** Refuses an erasure of anything but a record of a person: what the system must keep, and what holds no one's data. */
export function assertErasableRecordType(recordType: string): void {
  if (KEPT_BY_LAW_RECORD_TYPES.includes(recordType)) {
    throw new DomainError(
      "VALIDATION",
      "KEPT_BY_LAW",
      "Issued documents are kept as issued, as the law requires: erase the person they are about instead",
    );
  }
  if (!PERSONAL_RECORD_TYPES.includes(recordType)) {
    throw new DomainError(
      "VALIDATION",
      "NOT_PERSONAL_DATA",
      "Only a record of a person, such as a traveller, is erased",
    );
  }
}
