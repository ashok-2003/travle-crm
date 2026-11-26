// The firm's billing details (one row), entered in the console: who invoices are from and how to pay. Super admins only.
import { billingDetails, type BillingDetails, type SetBillingDetailsInput } from "@travel-crm/contracts/platform";
import type { PlatformTx } from "@travel-crm/db/platform";
import { characterLabel, unprintableCharactersIn } from "@travel-crm/integrations/pdf";
import { DomainError } from "../kernel/index.js";
import { recordPlatformAudit } from "./platform-log.js";
import type { PlatformServices } from "./services.js";

/** The saved details, or null before the first save. */
export async function readBillingDetails(tx: PlatformTx): Promise<BillingDetails | null> {
  const row = await tx.platformBillingDetails.findUnique({ where: { id: true } });
  return row === null ? null : billingDetails.parse(row);
}

export function getBillingDetails(services: PlatformServices): Promise<BillingDetails | null> {
  return services.platformDb.transaction((tx) => readBillingDetails(tx));
}

/** What an input leaves empty is not given: stored as null. */
function details(input: SetBillingDetailsInput): BillingDetails {
  const given = (value: string | undefined) => (value === undefined || value === "" ? null : value);
  return {
    legalName: input.legalName,
    address: input.address,
    stateCode: input.stateCode,
    pan: given(input.pan),
    gstin: given(input.gstin),
    phone: given(input.phone),
    email: given(input.email),
    bankAccountName: given(input.bankAccountName),
    bankAccountNumber: given(input.bankAccountNumber),
    bankIfsc: given(input.bankIfsc),
    bankNameBranch: given(input.bankNameBranch),
    upiId: given(input.upiId),
    defaultTerms: given(input.defaultTerms),
    proformaPrefix: input.proformaPrefix,
    invoicePrefix: input.invoicePrefix,
  };
}

/**
 * Replaces the details. Invoices already made keep the details they were made with. The log names the fields that
 * changed, never their values: bank details stay out of it.
 */
export async function setBillingDetails(
  services: PlatformServices,
  staff: { userId: string },
  input: SetBillingDetailsInput,
): Promise<BillingDetails> {
  const next = details(input);
  // Every detail may print on an invoice: refused here, so one bad character can't make every later invoice fail.
  const unprintable = unprintableCharactersIn(next);
  if (unprintable.length > 0) {
    throw new DomainError(
      "VALIDATION",
      "UNPRINTABLE_CHARACTERS",
      `The billing details have characters the PDF can't show yet: ${unprintable.map(characterLabel).join(", ")}`,
    );
  }
  return services.platformDb.transaction(async (tx) => {
    const before = await readBillingDetails(tx);
    await tx.platformBillingDetails.upsert({
      where: { id: true },
      create: { ...next, updatedBy: staff.userId },
      update: { ...next, updatedBy: staff.userId },
    });
    const changed = (Object.keys(next) as (keyof BillingDetails)[]).filter((key) => before?.[key] !== next[key]);
    if (changed.length > 0) {
      await recordPlatformAudit(tx, staff, {
        action: "billing-details.changed",
        targetType: "billing_details",
        targetId: "billing-details",
        after: { changed },
      });
    }
    return next;
  });
}
