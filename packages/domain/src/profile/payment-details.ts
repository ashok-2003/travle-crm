// The agency's payment details, kept once for the whole agency (lite agent, plan 2): the UPI ID and the bank account
// on the business profile, and a QR picture (payment-qr.ts). The agent quotes them after the advance it asks for.
import type { SavePaymentDetailsInput } from "@travel-crm/contracts/profile";
import { AGENCY_PAYMENT_QR_RECORD_TYPE } from "@travel-crm/contracts/profile";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import { readyAttachmentsIn } from "../files/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

export interface AgencyPaymentDetails {
  upiId: string | null;
  bankName: string | null;
  accountName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  /** The newest ready QR picture, if any. */
  qrAttachmentId: string | null;
}

/** The record the agency's payment QRs are attached to: the organization itself. */
export const agencyPaymentQrRecord = (organizationId: string) => ({
  recordType: AGENCY_PAYMENT_QR_RECORD_TYPE,
  recordId: organizationId,
});

/** The details inside a transaction already open (the agent's turn holds no member). Nothing set before a profile. */
export async function agencyPaymentDetailsOf(tx: OrgTx, organizationId: string): Promise<AgencyPaymentDetails> {
  const [profile, qrs] = await Promise.all([
    tx.organizationProfile.findUnique({
      where: { organizationId },
      select: { upiId: true, bankName: true, bankAccountName: true, bankAccountNumber: true, bankIfsc: true },
    }),
    readyAttachmentsIn(tx, agencyPaymentQrRecord(organizationId)),
  ]);
  return {
    upiId: profile?.upiId ?? null,
    bankName: profile?.bankName ?? null,
    accountName: profile?.bankAccountName ?? null,
    accountNumber: profile?.bankAccountNumber ?? null,
    ifsc: profile?.bankIfsc ?? null,
    // Newest last, so the newest QR wins if a failed removal left two.
    qrAttachmentId: qrs[qrs.length - 1]?.id ?? null,
  };
}

/** Somewhere to send an advance: a UPI ID, a QR, or the whole bank account (a bank name alone, or no IFSC, is not). */
export function paymentDetailsReady(details: AgencyPaymentDetails): boolean {
  return details.upiId !== null || details.qrAttachmentId !== null || hasWholeBank(details);
}

function hasWholeBank(details: AgencyPaymentDetails): boolean {
  return [details.bankName, details.accountName, details.accountNumber, details.ifsc].every((value) => value !== null);
}

/** The lines the agent sends after "Advance to book: ₹…": the UPI ID, and the bank account only as a whole set. */
export function paymentLinesOf(details: AgencyPaymentDetails): string[] {
  const lines: string[] = details.upiId === null ? [] : [`UPI: ${details.upiId}`];
  // A bank name or an account number alone cannot be paid to.
  const { bankName, accountName, accountNumber, ifsc } = details;
  if (bankName !== null && accountName !== null && accountNumber !== null && ifsc !== null) {
    lines.push(
      `Bank: ${bankName}`,
      `Account name: ${accountName}`,
      `Account number: ${accountNumber}`,
      `IFSC: ${ifsc}`,
    );
  }
  return lines;
}

const fields = ["upiId", "bankName", "accountName", "accountNumber", "ifsc"] as const;

/**
 * Saves the five values on the business profile. Audited as "profile.payment-details-changed" with the names of the
 * fields that changed, never the values (an account number is not for the audit log); the same values again record
 * nothing. The profile row must exist: onboarding saves it.
 */
export async function savePaymentDetails(
  tx: OrgTx,
  access: MemberAccess,
  input: SavePaymentDetailsInput,
): Promise<void> {
  // Two saves at once take turns, so each audit entry names what that save really changed.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`organization_profile:${access.organizationId}`}, 0))`;
  const before = await agencyPaymentDetailsOf(tx, access.organizationId);
  const exists = await tx.organizationProfile.count({ where: { organizationId: access.organizationId } });
  if (exists === 0) {
    throw new DomainError("CONFLICT", "PROFILE_NOT_SAVED", "Save the business details before the payment details");
  }
  const changed = fields.filter((field) => before[field] !== input[field]);
  if (changed.length === 0) return;
  await tx.organizationProfile.update({
    where: { organizationId: access.organizationId },
    data: {
      upiId: input.upiId,
      bankName: input.bankName,
      bankAccountName: input.accountName,
      bankAccountNumber: input.accountNumber,
      bankIfsc: input.ifsc,
      updatedBy: access.userId,
    },
  });
  await recordAudit(tx, access, {
    action: "profile.payment-details-changed",
    entityType: "organization",
    entityId: access.organizationId,
    after: { changed },
  });
}
