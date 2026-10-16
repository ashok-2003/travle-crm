"use client";

// The setup checklist (organization.setup.get) as the signed-in member sees it: which of the steps spec 7.1 lists are
// done, computed by the api from the profile, the logo and the staff, less the steps whose screen their role can't
// open (Staff, without staff:manage), which aren't theirs to finish; done once theirs are. Changing any of them asks
// for it again (use-profile.ts, use-branding.ts, use-logo.ts, use-staff.ts).
import type { SetupChecklist, SetupStep } from "@travel-crm/contracts/profile";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";
import { routes } from "@/lib/routes";
import { holds, useMe, type SignedInMember } from "@/session/me-context";

/** Where each step is done, and the permission that opens it. The profile's steps lead to their own section of it. */
export const stepScreens: Record<SetupStep, { href: string; requires: string }> = {
  "business-details": { href: `${routes.profile}#business-details`, requires: "settings:manage" },
  "contact-phone": { href: `${routes.profile}#contact-phone`, requires: "settings:manage" },
  logo: { href: routes.branding, requires: "settings:manage" },
  branding: { href: routes.branding, requires: "settings:manage" },
  "bank-details": { href: `${routes.profile}#bank-details`, requires: "settings:manage" },
  "invoice-prefix": { href: `${routes.profile}#invoice-prefix`, requires: "settings:manage" },
  staff: { href: routes.staff, requires: "staff:manage" },
};

/** The steps `me` may finish, and whether those are all done. */
function theirChecklist(me: SignedInMember, checklist: SetupChecklist): SetupChecklist {
  const steps = checklist.steps.filter(({ step }) => holds(me, stepScreens[step].requires));
  return { steps, done: steps.every((step) => step.done) };
}

export function useSetupChecklist() {
  const trpc = useTRPC();
  const me = useMe();
  return useQuery(
    trpc.organization.setup.get.queryOptions(undefined, { select: (checklist) => theirChecklist(me, checklist) }),
  );
}
