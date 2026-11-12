// The agency's payment QR and the details as the settings screen shows them: one picture of record type
// agency_payment_qr whose record is the organization, which a newly confirmed one replaces.
import type { PaymentDetails } from "@travel-crm/contracts/profile";
import type { Database } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { Files } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { agencyPaymentDetailsOf, paymentDetailsReady, agencyPaymentQrRecord } from "./payment-details.js";

export interface PaymentQrDependencies {
  db: Pick<Database, "forOrg">;
  files: Files;
}

/** The details with the QR's short-lived link, for the screen (and whoever holds settings:manage). */
export async function readPaymentDetails(
  { db, files }: PaymentQrDependencies,
  access: MemberAccess,
): Promise<PaymentDetails> {
  const details = await db.forOrg(access.organizationId, (tx) => agencyPaymentDetailsOf(tx, access.organizationId));
  const record = agencyPaymentQrRecord(access.organizationId);
  const newest = (await files.list(access, record)).at(-1);
  const qr = newest
    ? {
        id: newest.id,
        fileName: newest.fileName,
        url: (await files.downloadLink(access, { ...record, attachmentId: newest.id })).url,
      }
    : null;
  return {
    upiId: details.upiId,
    bankName: details.bankName,
    accountName: details.accountName,
    accountNumber: details.accountNumber,
    ifsc: details.ifsc,
    qr,
    ready: paymentDetailsReady(details),
  };
}

/** Audited by name only, like the fields beside it. */
async function auditQr(
  { db }: PaymentQrDependencies,
  access: MemberAccess,
  change: { before?: { qrAttachmentId: string }; after?: { qrAttachmentId: string } },
): Promise<void> {
  await db.forOrg(access.organizationId, (tx) =>
    recordAudit(tx, access, {
      action: "profile.payment-details-changed",
      entityType: "organization",
      entityId: access.organizationId,
      ...change,
      after: { changed: ["qr"], ...change.after },
    }),
  );
}

/** Once storage holds the promised picture it is the QR, and the one before it (and its file) goes. */
export async function confirmPaymentQr(
  dependencies: PaymentQrDependencies,
  access: MemberAccess,
  attachmentId: string,
): Promise<void> {
  const record = agencyPaymentQrRecord(access.organizationId);
  await dependencies.files.confirmUpload(access, { ...record, attachmentId });
  let previous: string | undefined;
  for (const old of await dependencies.files.list(access, record)) {
    if (old.id === attachmentId) continue;
    await dependencies.files.remove(access, { ...record, attachmentId: old.id });
    previous = old.id;
  }
  await auditQr(dependencies, access, {
    ...(previous === undefined ? {} : { before: { qrAttachmentId: previous } }),
    after: { qrAttachmentId: attachmentId },
  });
}

export async function removePaymentQr(
  dependencies: PaymentQrDependencies,
  access: MemberAccess,
  attachmentId: string,
): Promise<void> {
  await dependencies.files.remove(access, { ...agencyPaymentQrRecord(access.organizationId), attachmentId });
  await auditQr(dependencies, access, { before: { qrAttachmentId: attachmentId } });
}
