"use client";

// The setup checklist (organization.setup.get): which of the steps spec 7.1 lists are done, computed by the api from
// the profile, the logo and the staff. Changing any of them asks for it again (use-profile.ts, use-branding.ts,
// use-logo.ts, use-staff.ts).
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSetupChecklist() {
  const trpc = useTRPC();
  return useQuery(trpc.organization.setup.get.queryOptions());
}
