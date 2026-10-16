"use client";

// The names a platform log entry is read by, which the log itself never keeps (ADR 0019: ids and codes only, so it
// outlives a purge): platform staff by name for super admins, who may list them (support may not); plans by name;
// organizations by name, or as deleted once they are gone. Each organization is looked up on its own and kept for
// ten minutes, so "Show more" asks only for the ones it hasn't seen; one that fails other than by being gone says so.
import { useQueries, useQuery } from "@tanstack/react-query";
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { refusalOf } from "@/data/api-error";
import { useConsoleTRPC } from "../data/console-trpc";
import { isSuperAdmin, useStaff } from "../session/staff-context";

const NAMES_FRESH_MS = 10 * 60 * 1000;

export type OrganizationName =
  { state: "unknown" } | { state: "failed" } | { state: "found"; name: string } | { state: "deleted" };

export interface LogNames {
  /** Null when the viewer may not list platform staff, or the person isn't on the list. */
  personName(userId: string): string | null;
  planName(planId: string): string | null;
  organization(organizationId: string): OrganizationName;
}

export function useLogNames(entries: PlatformLogEntry[] | undefined): LogNames {
  const trpc = useConsoleTRPC();
  const superAdmin = isSuperAdmin(useStaff());
  const staff = useQuery(trpc.platformStaff.list.queryOptions(undefined, { enabled: superAdmin }));
  const plans = useQuery(trpc.plans.list.queryOptions({ includeArchived: true }));
  const organizationIds = [...new Set(entries?.flatMap((entry) => entry.targetOrganizationId ?? []))].sort();
  const organizations = useQueries({
    queries: organizationIds.map((organizationId) => ({
      ...trpc.organizations.get.queryOptions({ organizationId }),
      select: (details: { organization: { name: string } }) => details.organization.name,
      staleTime: NAMES_FRESH_MS,
      retry: (count: number, error: unknown) => refusalOf(error)?.reason !== "ORGANIZATION_NOT_FOUND" && count < 2,
    })),
  });

  const people = new Map(staff.data?.map((person) => [person.userId, person.name]));
  const planNames = new Map(plans.data?.map((plan) => [plan.id, plan.name]));
  const byId = new Map(organizationIds.map((organizationId, index) => [organizationId, organizations[index]]));
  return {
    personName: (userId) => people.get(userId) ?? null,
    planName: (planId) => planNames.get(planId) ?? null,
    organization: (organizationId) => {
      const result = byId.get(organizationId);
      if (result?.data !== undefined) return { state: "found", name: result.data };
      if (!result?.isError) return { state: "unknown" };
      return refusalOf(result.error)?.reason === "ORGANIZATION_NOT_FOUND" ? { state: "deleted" } : { state: "failed" };
    },
  };
}
