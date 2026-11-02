// How an agency's quotes are paid and taxed (step 3, P0): its UPI id and name (customers pay the agency directly), the
// GST rate most quotes use, and the terms printed under them. Saved by whoever manages settings; audited.
import { quoteSettings, type QuoteSettings, type SaveQuoteSettingsInput } from "@travel-crm/contracts/quotes";
import type { OrgTx } from "@travel-crm/db";
import { recordAudit } from "../audit/index.js";
import type { MemberAccess } from "../identity/index.js";

const columns = {
  upiId: true,
  upiName: true,
  defaultTaxRateBasisPoints: true,
  defaultTerms: true,
  defaultMarkupBasisPoints: true,
  minMarginBasisPoints: true,
  minMarginPerPersonPaise: true,
} as const;
const defaults: QuoteSettings = {
  upiId: "",
  upiName: "",
  defaultTaxRateBasisPoints: 500,
  defaultTerms: "",
  defaultMarkupBasisPoints: 0,
  minMarginBasisPoints: null,
  minMarginPerPersonPaise: null,
};

type SettingsRow = Omit<QuoteSettings, "minMarginPerPersonPaise"> & { minMarginPerPersonPaise: bigint | null };

const settingsOf = (row: SettingsRow): QuoteSettings =>
  quoteSettings.parse({
    ...row,
    minMarginPerPersonPaise: row.minMarginPerPersonPaise === null ? null : Number(row.minMarginPerPersonPaise),
  });

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
  const data = {
    ...input,
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
  return settingsOf(row as SettingsRow);
}

/** A link that opens the customer's UPI app to pay the agency (NPCI's upi://pay), or null without a UPI id. */
export function upiPayLink(
  settings: Pick<QuoteSettings, "upiId" | "upiName">,
  payment: { amountPaise: number; note: string },
): string | null {
  if (settings.upiId === "" || payment.amountPaise <= 0) return null;
  const params = new URLSearchParams({
    pa: settings.upiId,
    pn: settings.upiName === "" ? settings.upiId : settings.upiName,
    am: `${String(Math.floor(payment.amountPaise / 100))}.${String(payment.amountPaise % 100).padStart(2, "0")}`,
    cu: "INR",
    tn: payment.note.slice(0, 50),
  });
  return `upi://pay?${params.toString()}`;
}
