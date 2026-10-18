// Saved copies of the query cache for tests, made the way the app makes them: a QueryCopy that saves the cache as it
// changes (createQueryCopy and startSaving, as page-data.ts does), under the queries' real tRPC keys.
import "fake-indexeddb/auto";
import type { AppRouter } from "@travel-crm/api";
import type { StaffMember } from "@travel-crm/contracts/identity";
import { QueryClient } from "@tanstack/react-query";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { vi } from "vitest";
import type { CopyOwner } from "@/data/owner";
import { createQueryCopy, hasPersistedQueries } from "@/data/persistence";
import { createApiClient } from "@/data/trpc";
import type { SignedInMember } from "@/session/me-context";

/** The build the provider uses in tests (no NEXT_PUBLIC_CACHE_VERSION). */
export const TEST_BUILD = "development";

export const ownerOfMember = (me: SignedInMember): CopyOwner => ({
  userId: me.user.id,
  organizationId: me.organization.id,
});

/** The tRPC query keys of the two queries these tests use. */
export function queryKeys() {
  const trpc = createTRPCOptionsProxy<AppRouter>({ client: createApiClient(), queryClient: new QueryClient() });
  return { me: trpc.me.get.queryKey(), staff: trpc.staff.list.queryKey() };
}

/** A client whose cache is saved as the app saves it, for owner. */
export function savingClient(owner: CopyOwner | null) {
  const queryClient = new QueryClient();
  const copy = createQueryCopy(queryClient, { owner: () => owner, buster: TEST_BUILD });
  copy.startSaving();
  return { queryClient, copy };
}

/** A row of the staff list, by name. */
export function staffNamed(name: string): StaffMember {
  return {
    memberId: `member-${name}`,
    userId: `user-${name}`,
    name,
    email: null,
    username: name.toLowerCase(),
    role: { key: "sales", name: "Sales", isOwner: false },
    twoFactorEnabled: false,
    mustChangePassword: false,
    joinedAt: "2026-01-02T05:00:00.000Z",
  };
}

/** Saves me's answer and a staff list to IndexedDB, as the page of the person me names would. */
export async function saveCopyFor(me: SignedInMember, staffNames: string[]): Promise<void> {
  const { queryClient, copy } = savingClient(ownerOfMember(me));
  const keys = queryKeys();
  queryClient.setQueryData(keys.me, me);
  queryClient.setQueryData(keys.staff, staffNames.map(staffNamed));
  await vi.waitFor(async () => {
    if (!(await hasPersistedQueries())) throw new Error("not saved yet");
  });
  // Let the throttle's second, trailing save land too, then leave this page's copy alone.
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  await copy.stop();
}

export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
