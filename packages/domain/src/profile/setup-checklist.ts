// The setup checklist (spec 7.1): what an Owner still has to do after onboarding, each step done only once its data is
// there. WhatsApp and lead import join it when their steps exist.
import {
  type OrganizationProfileDetails,
  type SetupChecklist,
  type SetupStep,
  setupStep,
} from "@travel-crm/contracts/profile";

/** What the checklist is read from. The Owner counts among the active staff. */
export interface SetupFacts {
  profile: OrganizationProfileDetails | null;
  activeStaff: number;
  /** Whether a logo was confirmed (organization.logo). */
  hasLogo: boolean;
}

/** Which steps are done, in the contract's order. */
export function setupChecklistOf({ profile, activeStaff, hasLogo }: SetupFacts): SetupChecklist {
  const has = (field: keyof OrganizationProfileDetails): boolean => (profile?.[field]?.trim() ?? "") !== "";
  const done: Record<SetupStep, boolean> = {
    "business-details": has("legalName") && has("address"),
    "contact-phone": has("contactPhone"),
    logo: hasLogo,
    branding: has("brandColour") || has("documentTerms"),
    "bank-details": has("bankAccountNumber") && has("bankIfsc"),
    "invoice-prefix": has("invoicePrefix"),
    staff: activeStaff > 1,
  };
  const steps = setupStep.options.map((step) => ({ step, done: done[step] }));
  return { steps, done: steps.every((step) => step.done) };
}
