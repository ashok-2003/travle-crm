// The setup checklist (spec 7.1): what an Owner still has to do after onboarding. Logo, WhatsApp and lead import join
// it when their steps exist.
import type { OrganizationProfileDetails, SetupChecklist, SetupStep } from "@travel-crm/contracts/profile";

/** Which steps are done, from the profile and how many active staff the organization has (the Owner counts). */
export function setupChecklistOf(profile: OrganizationProfileDetails | null, activeStaff: number): SetupChecklist {
  const has = (field: keyof OrganizationProfileDetails): boolean => (profile?.[field] ?? null) !== null;
  const done: Record<SetupStep, boolean> = {
    "business-details": has("address") && has("contactPhone"),
    "bank-details": has("bankAccountNumber") && has("bankIfsc"),
    "invoice-prefix": has("invoicePrefix"),
    branding: has("brandColour") || has("documentTerms"),
    staff: activeStaff > 1,
  };
  const steps = (Object.keys(done) as SetupStep[]).map((step) => ({ step, done: done[step] }));
  return { steps, done: steps.every((step) => step.done) };
}
