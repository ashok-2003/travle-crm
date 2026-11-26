// How an agency's quotes are paid and taxed (step 3, P0): its UPI id and name (customers pay the agency directly), the
// GST rate most quotes use, and the terms printed under them. Saved by whoever manages settings; audited.
import { quoteSettings, type QuoteSettings, type SaveQuoteSettingsInput } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";
import { DomainError } from "../kernel/index.js";

const columns = {
  upiId: true,
  upiName: true,
  defaultTaxRateBasisPoints: true,
  defaultTerms: true,
  defaultMarkupBasisPoints: true,
  minMarginBasisPoints: true,
  minMarginPerPersonPaise: true,
  upiVerifiedAt: true,
  upiVerifiedBy: true,
  upiVerifiedUpiId: true,
} as const;
const defaults: QuoteSettings = {
  upiId: "",
  upiName: "",
  defaultTaxRateBasisPoints: 500,
  defaultTerms: "",
  defaultMarkupBasisPoints: 0,
  minMarginBasisPoints: null,
  minMarginPerPersonPaise: null,
  upiVerifiedAt: null,
  upiVerifiedBy: null,
  upiVerifiedByName: null,
};

type SettingsRow = Omit<
  QuoteSettings,
  "minMarginPerPersonPaise" | "upiVerifiedAt" | "upiVerifiedBy" | "upiVerifiedByName"
> & {
  minMarginPerPersonPaise: bigint | null;
  upiVerifiedAt: Date | null;
  upiVerifiedBy: string | null;
  upiVerifiedUpiId: string | null;
};

/** The verification counts only for the UPI id it was made for: the id the customer is shown now. */
const settingsOf = ({ upiVerifiedUpiId, ...row }: SettingsRow): QuoteSettings => {
  const verified = row.upiId !== "" && upiVerifiedUpiId === row.upiId && row.upiVerifiedAt !== null;
  return quoteSettings.parse({
    ...row,
    minMarginPerPersonPaise: row.minMarginPerPersonPaise === null ? null : Number(row.minMarginPerPersonPaise),
    upiVerifiedAt: verified ? row.upiVerifiedAt?.toISOString() : null,
    upiVerifiedBy: verified ? row.upiVerifiedBy : null,
    upiVerifiedByName: null,
  });
};

export async function quoteSettingsOf(tx: OrgTx): Promise<QuoteSettings> {
  const row = await tx.quoteSettings.findFirst({ select: columns });
  return row === null ? defaults : settingsOf(row as SettingsRow);
}

export async function saveQuoteSettings(
  tx: OrgTx,
  access: MemberAccess,
  input: SaveQuoteSettingsInput,
): Promise<QuoteSettings> {
  const before = await quoteSettingsOf(tx);
  // A different UPI id was never scanned: its verification goes, and says so in the audit log.
  const clearing = before.upiVerifiedAt !== null && input.upiId !== before.upiId;
  const data = {
    ...input,
    ...(clearing ? { upiVerifiedAt: null, upiVerifiedBy: null, upiVerifiedUpiId: null } : {}),
    minMarginPerPersonPaise: input.minMarginPerPersonPaise === null ? null : BigInt(input.minMarginPerPersonPaise),
    updatedBy: access.userId,
  };
  const existing = await tx.quoteSettings.findFirst({ select: { organizationId: true } });
  const row =
    existing === null
      ? await tx.quoteSettings.create({ data, select: columns })
      : await tx.quoteSettings.update({ where: { organizationId: existing.organizationId }, data, select: columns });
  await recordAudit(tx, access, {
    action: "quote-settings.changed",
    entityType: "quote_settings",
    entityId: access.organizationId,
    before: {
      upiId: before.upiId,
      defaultTaxRateBasisPoints: before.defaultTaxRateBasisPoints,
      defaultMarkupBasisPoints: before.defaultMarkupBasisPoints,
      minMarginBasisPoints: before.minMarginBasisPoints,
    },
    after: {
      upiId: row.upiId,
      defaultTaxRateBasisPoints: row.defaultTaxRateBasisPoints,
      defaultMarkupBasisPoints: row.defaultMarkupBasisPoints,
      minMarginBasisPoints: row.minMarginBasisPoints,
    },
  });
  if (clearing) {
    await recordAudit(tx, access, {
      action: "quote-settings.upi-verification-cleared",
      entityType: "quote_settings",
      entityId: access.organizationId,
      before: { upiId: before.upiId },
      after: { upiId: row.upiId },
    });
  }
  return settingsOf(row as SettingsRow);
}

/**
 * Someone scanned the agency's UPI QR, paid ₹1 and saw it arrive: records when, who and which UPI id, audited. Already
 * verified for this UPI id changes nothing. The api checks the permission and reads the session afresh.
 */
export async function verifyUpi(tx: OrgTx, access: MemberAccess, now: Date): Promise<QuoteSettings> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quote_settings:${access.organizationId}`}, 0))`;
  const current = await quoteSettingsOf(tx);
  if (current.upiId === "") throw new DomainError("CONFLICT", "UPI_ID_MISSING", "Save a UPI id before verifying it");
  if (current.upiVerifiedAt !== null) return current;
  const row = await tx.quoteSettings.update({
    where: { organizationId: access.organizationId },
    data: { upiVerifiedAt: now, upiVerifiedBy: access.userId, upiVerifiedUpiId: current.upiId },
    select: columns,
  });
  await recordAudit(tx, access, {
    action: "quote-settings.upi-verified",
    entityType: "quote_settings",
    entityId: access.organizationId,
    after: { upiId: current.upiId },
  });
  return settingsOf(row as SettingsRow);
}
