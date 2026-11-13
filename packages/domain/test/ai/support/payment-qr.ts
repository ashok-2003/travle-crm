// Gives an agency a payment QR, or takes it away, straight in the table: the agent sells only where a QR is stored.
import { AGENCY_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/files";
import { randomUUID } from "node:crypto";
import { softDeleted, type OrgTx } from "@travel-crm/db";

export async function addPaymentQr(tx: OrgTx, organizationId: string): Promise<void> {
  await tx.attachment.create({
    data: {
      recordType: AGENCY_PAYMENT_QR_RECORD_TYPE,
      recordId: organizationId,
      fileName: "qr.png",
      contentType: "image/png",
      sizeBytes: 3,
      status: "ready",
      confirmedAt: new Date(),
    },
  });
}

/** Soft-deletes every QR the agency has. */
export async function removePaymentQrs(tx: OrgTx, organizationId: string): Promise<void> {
  await tx.attachment.updateMany({
    where: { recordType: AGENCY_PAYMENT_QR_RECORD_TYPE, recordId: organizationId },
    data: softDeleted(randomUUID()),
  });
}
