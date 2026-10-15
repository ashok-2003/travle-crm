"use client";

// The names a platform log entry is read by, which the log itself never keeps (ADR 0019: ids and codes only, so it
// outlives a purge): platform staff by name for super admins, who may list them (support may not); plans by name;
// organizations by name, or as deleted once they are gone.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PlatformLogEntry } from "@travel-crm/contracts/platform";
import { useMemo } from "react";
import { refusalOf } from "@/data/api-error";
import { useConsoleTRPC, useConsoleTRPCClient, type ConsoleClient } from "../data/console-trpc";
import { isSuperAdmin, useStaff } from "../session/staff-context";

export type OrganizationName = { state: "unknown" } | { state: "found"; name: string } | { state: "deleted" };

export interface LogNames {
  /** Null when the viewer may not list platform staff, or the person isn't on the list. */
  personName(userId: string): string | null;
  planName(planId: string): string | null;
  organization(organizationId: string): OrganizationName;
}

/** How many organizations are asked for at once: each is a transaction of the console's. */
const AT_ONCE = 5;

/** Each organization's name, or null once it is gone; one that didn't load is left out (its name stays unknown). */
async function organizationNames(client: ConsoleClient, ids: string[]): Promise<Record<string, string | null>> {
  const names: Record<string, string | null> = {};
  for (let start = 0; start < ids.length; start += AT_ONCE) {
    await Promise.all(
      ids.slice(start, start + AT_ONCE).map(async (organizationId) => {
        try {
          names[organizationId] = (await client.organizations.get.query({ organizationId })).organization.name;
        } catch (error) {
          if (refusalOf(error)?.reason === "ORGANIZATION_NOT_FOUND") names[organizationId] = null;
        }
      }),
    );
  }
  return names;
}

export function useLogNames(entries: PlatformLogEntry[] | undefined): LogNames {
  const trpc = useConsoleTRPC();
  const client = useConsoleTRPCClient();
  const superAdmin = isSuperAdmin(useStaff());
  const staff = useQuery(trpc.platformStaff.list.queryOptions(undefined, { enabled: superAdmin }));
  const plans = useQuery(trpc.plans.list.queryOptions({ includeArchived: true }));
  const organizationIds = useMemo(
    () => [...new Set(entries?.flatMap((entry) => entry.targetOrganizationId ?? []))].sort(),
    [entries],
  );
  const organizations = useQuery({
    queryKey: [...trpc.log.list.pathKey(), "organizations", organizationIds],
    queryFn: () => organizationNames(client, organizationIds),
    enabled: organizationIds.length > 0,
    // A longer page asks again for every organization on it; the names already known stay meanwhile.
    placeholderData: keepPreviousData,
  });

  return useMemo(() => {
    const people = new Map(staff.data?.map((person) => [person.userId, person.name]));
    const planNames = new Map(plans.data?.map((plan) => [plan.id, plan.name]));
    const found = organizations.data ?? {};
    return {
      personName: (userId) => people.get(userId) ?? null,
      planName: (planId) => planNames.get(planId) ?? null,
      organization: (organizationId) => {
        const name = found[organizationId];
        if (name === undefined) return { state: "unknown" };
        return name === null ? { state: "deleted" } : { state: "found", name };
      },
    };
  }, [staff.data, plans.data, organizations.data]);
}
