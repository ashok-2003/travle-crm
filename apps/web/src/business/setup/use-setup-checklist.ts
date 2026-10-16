"use client";

// The setup checklist (organization.setup.get): which of the steps spec 7.1 lists are done, computed by the api from
// the profile and the staff. Saving the profile asks for it again (use-profile.ts).
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/data/trpc";

export function useSetupChecklist() {
  const trpc = useTRPC();
  return useQuery(trpc.organization.setup.get.queryOptions());
}
