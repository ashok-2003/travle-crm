// The tRPC client and its TanStack Query hooks (spec 11). The web app knows the api only by its AppRouter type; calls
// go to /api/trpc on the address the app was loaded from (spec 3), batched, as GET for queries and JSON POST for
// mutations, which the api requires (it refuses other origins and content types).
import type { AppRouter } from "@travel-crm/api";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

export function createApiClient() {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/api/trpc" })] });
}

export type ApiClient = ReturnType<typeof createApiClient>;
