// The query cache keeps slow-changing data (a role, the plan, the logo) for ten minutes and everything else for 30 s.
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@travel-crm/api";
import { describe, expect, it } from "vitest";
import { createApiClient } from "@/data/trpc";
import { createQueryClient, SLOW_DATA, SLOW_DATA_STALE_MS } from "@/data/query-client";

const handlers = { onSignedOut: () => undefined, onPendingStep: () => undefined };

describe("the query client", () => {
  it("keeps ten minutes of slow-changing data, found by the keys the tRPC hooks build", () => {
    const queryClient = createQueryClient(handlers);
    const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
    const keys = [
      trpc.me.get.queryKey(),
      trpc.subscription.get.queryKey(),
      trpc.organization.logo.forShell.queryKey(),
      trpc.roles.list.queryKey(),
      trpc.staff.list.queryKey(),
      trpc.leads.owners.queryKey(),
      trpc.settings.get.queryKey(),
      trpc.quotes.settings.queryKey(),
      trpc.inbox.status.queryKey(),
      trpc.inbox.tags.queryKey(),
      trpc.usage.welcome.queryKey(),
      trpc.me.ownPassword.queryKey(),
      trpc.organization.setup.get.queryKey(),
    ];
    for (const key of keys) {
      expect(queryClient.getQueryDefaults(key)).toMatchObject({
        staleTime: SLOW_DATA_STALE_MS,
        refetchOnWindowFocus: false,
      });
    }
    expect(SLOW_DATA_STALE_MS).toBe(600_000);
  });

  it("keeps the console's slow data too, and every other query at 30 seconds", () => {
    const queryClient = createQueryClient(handlers);
    for (const path of ["whoAmI", "plans.list", "plans.policy", "platformStaff.list"]) {
      expect(SLOW_DATA).toContain(path);
      expect(queryClient.getQueryDefaults([path.split("."), { type: "query" }]).staleTime).toBe(SLOW_DATA_STALE_MS);
    }
    const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient });
    expect(queryClient.getQueryDefaults(trpc.leads.list.queryKey({})).staleTime).toBeUndefined();
    expect(queryClient.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });
});
