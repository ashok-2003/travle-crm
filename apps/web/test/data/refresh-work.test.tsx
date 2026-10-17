// After a change to the agency's work, everything that shows it loads again (W3). One refresh serves every lead, task,
// block and destination change: the lead list and its chips' counts, a lead's page, the owner pickers and the new-lead
// form's contact warning, Today, the destination lists and the blocked contacts. A staff or role change reloads the
// people who may own a lead. Only what is on screen refetches; the rest is marked stale.
import type { AppRouter } from "@travel-crm/api";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "@/data/trpc";
import { useRefreshWork } from "@/data/use-refresh-work";
import { useUpdateRole } from "@/organization/roles/use-roles";
import { useRemoveStaff } from "@/organization/staff/use-staff";
import { fakeApi, newQueryClient, withApp } from "../organization/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A cache holding one of each list a change to the work may make stale, and one it never does. */
function seededCache() {
  const queryClient = newQueryClient();
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
  const work: Record<string, QueryKey> = {
    "the lead list": [...trpc.leads.list.pathKey(), { view: "mine", stage: "open", limit: 25 }],
    "the chips' counts": trpc.leads.counts.queryKey({ view: "mine" }),
    "a lead's page": trpc.leads.get.queryKey({ leadId: "0199e7a0-0000-7000-8000-000000000001" }),
    "the owner pickers": trpc.leads.owners.queryKey(),
    "the new-lead form's contact warning": trpc.leads.knownContact.queryKey({ phone: "+919876543210" }),
    Today: trpc.today.summary.queryKey(),
    "the destination lists": trpc.destinations.search.queryKey({ limit: 100 }),
    "the blocked contacts": [...trpc.blockedContacts.list.pathKey(), {}],
  };
  const unrelated = trpc.staff.list.queryKey();
  for (const key of [...Object.values(work), unrelated]) queryClient.setQueryData(key, {});
  return { queryClient, work, unrelated, owners: trpc.leads.owners.queryKey() };
}

const isStale = (queryClient: QueryClient, key: QueryKey) => queryClient.getQueryState(key)?.isInvalidated === true;

describe("useRefreshWork", () => {
  it("marks everything that shows the work stale, and nothing else", async () => {
    const { queryClient, work, unrelated } = seededCache();
    const { result } = renderHook(() => useRefreshWork(), { wrapper: withApp(queryClient) });
    await act(() => result.current());
    for (const [shows, key] of Object.entries(work)) expect(isStale(queryClient, key), shows).toBe(true);
    expect(isStale(queryClient, unrelated)).toBe(false);
  });
});

describe("staff and role changes", () => {
  it("reload the people who may own a lead", async () => {
    const api = fakeApi();
    const staff = seededCache();
    const removing = renderHook(() => useRemoveStaff("Ravi Kumar", () => undefined), {
      wrapper: withApp(staff.queryClient),
    });
    act(() => {
      removing.result.current.mutate({ memberId: "0199a000-0000-7000-8000-0000000000b1" });
    });
    await waitFor(() => {
      expect(api.calls).toHaveLength(1);
    });
    api.last().answer(null);
    await waitFor(() => {
      expect(isStale(staff.queryClient, staff.owners)).toBe(true);
    });

    const roles = seededCache();
    const updating = renderHook(() => useUpdateRole(), { wrapper: withApp(roles.queryClient) });
    act(() => {
      updating.result.current.mutate({ key: "sales", permissions: [{ permission: "leads:view", scope: "own" }] });
    });
    await waitFor(() => {
      expect(api.calls).toHaveLength(2);
    });
    api.last().refuse(400, "ROLE_NOT_FOUND");
    await waitFor(() => {
      expect(isStale(roles.queryClient, roles.owners)).toBe(true);
    });
  });
});
