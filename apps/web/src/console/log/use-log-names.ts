"use client";

// The names a platform log entry is read by, which the log itself never keeps (ADR 0019: ids and codes only, so it
// outlives a purge): platform staff by name for super admins, who may list them (support may not); plans by name;
// organizations by the name the log's own answer carries, or as deleted once they are gone.
import { useQuery } from "@tanstack/react-query";
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { useConsoleTRPC } from "../data/console-trpc";
import { isSuperAdmin, useStaff } from "../session/staff-context";

export type OrganizationName = { state: "found"; name: string } | { state: "deleted" };

export interface LogNames {
  /** Null when the viewer may not list platform staff, or the person isn't on the list. */
  personName(userId: string): string | null;
  planName(planId: string): string | null;
  /** The organization an entry concerns: by its name, or deleted when the log has none for it. */
  organization(entry: PlatformLogEntry): OrganizationName;
}

export function useLogNames(): LogNames {
  const trpc = useConsoleTRPC();
  const superAdmin = isSuperAdmin(useStaff());
  const staff = useQuery(trpc.platformStaff.list.queryOptions(undefined, { enabled: superAdmin }));
  const plans = useQuery(trpc.plans.list.queryOptions({ includeArchived: true }));
  const people = new Map(staff.data?.map((person) => [person.userId, person.name]));
  const planNames = new Map(plans.data?.map((plan) => [plan.id, plan.name]));
  return {
    personName: (userId) => people.get(userId) ?? null,
    planName: (planId) => planNames.get(planId) ?? null,
    organization: (entry) =>
      entry.organizationName === null ? { state: "deleted" } : { state: "found", name: entry.organizationName },
  };
}
